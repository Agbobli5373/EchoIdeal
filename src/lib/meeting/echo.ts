import { listen } from "@tauri-apps/api/event";

/**
 * Echo: without headphones, the microphone also hears the other side through the
 * speakers, so their words come back from the microphone as if the Candidate had
 * said them. A microphone line is an Echo when it was spoken while system audio
 * was hearing the other side and its words match theirs; it's dropped instead of
 * becoming a Spoken Answer.
 */

type HeardLine = { start: number; end: number; text: Promise<string | null> };

// Timing differs between the two streams: each detects the end of speech in its own way.
const SLACK_MS = 2000;
// How long a microphone line waits for system audio to finish and transcribe the same speech.
const MAX_WAIT_MS = 20000;
// Time for the system audio listener to register a line after its speech ends.
const REGISTER_GRACE_MS = 300;
const KEEP_MS = 60000;
// A line this long matches when this share of its words, in order, is in what system audio heard.
const MIN_WORDS_FOR_RATIO = 3;
const MATCH_RATIO = 0.6;

// What system audio heard in this window recently.
let heard: HeardLine[] = [];
// When system audio started speech it hasn't finished yet.
let speakingSince: number | null = null;
let changed: (() => void)[] = [];
let watching: Promise<void> | null = null;

const notify = () => {
  const waiting = changed;
  changed = [];
  waiting.forEach((resolve) => resolve());
};

const stopSpeaking = () => {
  speakingSince = null;
  notify();
};

/** Follows when system audio is mid-speech. Safe to call more than once. */
export function watchSystemSpeech(): Promise<void> {
  watching ??= Promise.all([
    listen("speech-start", () => {
      speakingSince = Date.now();
    }),
    listen("speech-detected", stopSpeaking),
    listen("speech-discarded", stopSpeaking),
    listen("capture-stopped", stopSpeaking),
  ])
    .then(() => undefined)
    .catch((err) => {
      watching = null;
      console.error("Failed to follow system audio for echoes:", err);
    });
  return watching;
}

/**
 * Records a line system audio heard, ending at `end` and lasting `durationMs`.
 * Call the returned function with its transcription, or null when it has none.
 */
export function heardFromSystem(
  end: number,
  durationMs: number
): (text: string | null) => void {
  let done: (text: string | null) => void = () => {};
  const text = new Promise<string | null>((resolve) => (done = resolve));
  heard = heard.filter((line) => line.end > Date.now() - KEEP_MS);
  heard.push({ start: end - durationMs, end, text });
  notify();
  return done;
}

/** How long a base64 WAV lasts, from its header and size. 0 when it isn't a WAV. */
export function wavDurationMs(base64: string): number {
  try {
    const header = atob(base64.slice(0, 64));
    if (header.length < 44 || !header.startsWith("RIFF")) return 0;
    const byteRate = [28, 29, 30, 31].reduce(
      (rate, at, i) => rate + header.charCodeAt(at) * 256 ** i,
      0
    );
    if (!byteRate) return 0;
    const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
    const bytes = (base64.length * 3) / 4 - padding;
    return (Math.max(0, bytes - 44) / byteRate) * 1000;
  } catch {
    return 0;
  }
}

const wordsOf = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(" ")
    .filter(Boolean);

// How many of `said`'s words appear in `heard` in the same order.
function wordsInOrder(said: string[], heard: string[]): number {
  let previous = new Array(heard.length + 1).fill(0);
  for (const word of said) {
    const row = [0];
    for (let j = 0; j < heard.length; j++) {
      row.push(
        word === heard[j] ? previous[j] + 1 : Math.max(previous[j + 1], row[j])
      );
    }
    previous = row;
  }
  return previous[heard.length];
}

const containsRun = (heard: string[], said: string[]) =>
  heard.some((_, i) => said.every((word, k) => heard[i + k] === word));

/** Whether `said` repeats `heard`: short lines word for word, longer ones mostly. */
export function repeatsWords(said: string, heard: string): boolean {
  const saidWords = wordsOf(said);
  const heardWords = wordsOf(heard);
  if (saidWords.length === 0 || heardWords.length === 0) return false;
  if (saidWords.length < MIN_WORDS_FOR_RATIO) {
    return containsRun(heardWords, saidWords);
  }
  return wordsInOrder(saidWords, heardWords) / saidWords.length >= MATCH_RATIO;
}

const until = (ms: number) =>
  new Promise<null>((resolve) => setTimeout(() => resolve(null), Math.max(0, ms)));

/**
 * Whether a microphone line spoken from `start` to `end` is an Echo of what system
 * audio heard. Waits (a bounded time) for system audio still hearing or
 * transcribing the same speech.
 */
export async function isEcho(
  text: string,
  start: number,
  end: number
): Promise<boolean> {
  const deadline = Date.now() + MAX_WAIT_MS;

  // The other side may still be talking: their line ends after this one did.
  while (
    speakingSince !== null &&
    speakingSince <= end + SLACK_MS &&
    Date.now() < deadline
  ) {
    await Promise.race([
      new Promise<void>((resolve) => changed.push(resolve)),
      until(deadline - Date.now()),
    ]);
  }
  await until(REGISTER_GRACE_MS);

  const overlapping = heard
    .filter((line) => line.start - SLACK_MS <= end && line.end + SLACK_MS >= start)
    .sort((a, b) => a.start - b.start);
  if (overlapping.length === 0) return false;

  // Echo only happens while the other side is talking; a line running past that is the Candidate's.
  const heardFrom = Math.min(...overlapping.map((line) => line.start));
  const heardUntil = Math.max(...overlapping.map((line) => line.end));
  if (start < heardFrom - SLACK_MS || end > heardUntil + SLACK_MS) return false;

  const texts = await Promise.race([
    Promise.all(overlapping.map((line) => line.text)),
    until(deadline - Date.now()),
  ]);
  if (!texts) return false;
  return repeatsWords(text, texts.filter(Boolean).join(" "));
}
