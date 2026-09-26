import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { STORAGE_KEYS } from "@/config/constants";
import { safeLocalStorage } from "../storage/helper";
import {
  getMeetingVoices,
  saveMeetingVoice,
  type MeetingVoice,
} from "../database/meetings.action";

/**
 * Voices: telling the people on the other side of a Meeting apart by how they sound.
 * Each of their lines gets a voice fingerprint on this computer; a line close enough to
 * a Voice's profile is that Voice, anything else is a new one. Voices are numbered in
 * the order they first speak, and belong to one Meeting only.
 */

// How close (cosine) a line must be to a Voice's profile to be that Voice.
const SAME_VOICE = 0.5;

export function tellsVoicesApart(): boolean {
  return safeLocalStorage.getItem(STORAGE_KEYS.TELL_VOICES_APART) !== "false";
}

export function setTellVoicesApart(on: boolean): void {
  safeLocalStorage.setItem(STORAGE_KEYS.TELL_VOICES_APART, String(on));
}

export type VoiceModelStatus = { ready: boolean; downloading: boolean; sizeBytes: number };

export const getVoiceModelStatus = () => invoke<VoiceModelStatus>("get_voice_model_status");

/** Downloads the voice model in the background, if Voices are on and it isn't here yet. */
export function prepareVoiceModel(): void {
  if (!tellsVoicesApart()) return;
  invoke("download_voice_model").catch((err) =>
    console.info("Voice model not ready; the other side stays one speaker:", err)
  );
}

// Per Meeting in this window: its Voices, and the lines being matched, one at a time.
type MeetingState = {
  voices: Promise<MeetingVoice[]>;
  queue: Promise<unknown>;
  last: number | null;
};
const meetings = new Map<string, MeetingState>();

const VOICES_CHANGED = "meeting-voices-changed";
let watching = false;

function stateFor(meetingId: string): MeetingState {
  if (!watching) {
    watching = true;
    // Voices merged or lines moved in another window: read them again.
    listen<string>(VOICES_CHANGED, (event) => meetings.delete(event.payload)).catch(() => {
      watching = false;
    });
  }
  let state = meetings.get(meetingId);
  if (!state) {
    state = { voices: getMeetingVoices(meetingId), queue: Promise.resolve(), last: null };
    meetings.set(meetingId, state);
  }
  return state;
}

/** Tells every window that a Meeting's Voices changed. */
export async function voicesChanged(meetingId: string): Promise<void> {
  meetings.delete(meetingId);
  await emit(VOICES_CHANGED, meetingId).catch(() => {});
}

// Cosine between a unit fingerprint and a Voice's profile (a sum of unit fingerprints).
function closeness(fingerprint: Float32Array, profile: Float32Array): number {
  let dot = 0;
  let norm = 0;
  for (let i = 0; i < profile.length; i++) {
    dot += fingerprint[i] * profile[i];
    norm += profile[i] * profile[i];
  }
  return norm > 0 ? dot / Math.sqrt(norm) : -1;
}

/**
 * Which Voice said this line of the other side (a base64 WAV), or null when Voices
 * are off or the voice model isn't downloaded yet. Speech too short to tell counts as
 * whoever spoke last.
 */
export function voiceOf(meetingId: string, audio: string): Promise<number | null> {
  if (!tellsVoicesApart()) return Promise.resolve(null);
  const state = stateFor(meetingId);
  const result = state.queue.then(async () => {
    const values = await invoke<number[] | null>("voice_fingerprint", { audio }).catch(
      (err) => {
        console.error("Voice fingerprint failed:", err);
        return null;
      }
    );
    if (!values) return state.last;

    const fingerprint = Float32Array.from(values);
    const voices = await state.voices;
    let best: MeetingVoice | null = null;
    let bestCloseness = -1;
    for (const voice of voices) {
      const c = closeness(fingerprint, voice.fingerprint);
      if (c > bestCloseness) {
        bestCloseness = c;
        best = voice;
      }
    }

    let voice: MeetingVoice;
    if (best && bestCloseness >= SAME_VOICE) {
      voice = best;
      voice.fingerprint = voice.fingerprint.map((x, i) => x + fingerprint[i]);
      voice.lines += 1;
    } else {
      voice = { voice: nextVoice(voices), fingerprint, lines: 1 };
      voices.push(voice);
    }
    await saveMeetingVoice(meetingId, voice);
    state.last = voice.voice;
    return voice.voice;
  });
  state.queue = result.catch(() => {});
  return result;
}

export const nextVoice = (voices: { voice: number }[]) =>
  voices.reduce((max, v) => Math.max(max, v.voice), 0) + 1;
