import { splitUngrounded } from "../knowledge/grounding";

// Markers an answer can carry besides the Ungrounded one. Both go at the end of a reply, so
// the answer itself streams first.
export const SCREEN_OPEN = "[[SCREEN]]";
export const SCREEN_CLOSE = "[[/SCREEN]]";
export const DISCREPANCY_OPEN = "[[DISCREPANCY:";

const SCREEN_BLOCK = /\[\[SCREEN\]\]([\s\S]*?)(?:\[\[\/SCREEN\]\]|$)/g;
const DISCREPANCY = /\[\[DISCREPANCY:([\s\S]*?)(?:\]\]|$)/g;

export interface ParsedAnswer {
  text: string;
  ungrounded: boolean;
  // Private notes for the Candidate where what they said differs from Active Knowledge.
  discrepancies: string[];
  // What a Screen Capture showed, as transcribed by the call that answered it.
  screenText: string | null;
}

// Also hides a marker that is still streaming in (e.g. a trailing "[[SCRE" or an unclosed
// block), so none of it ever flashes on screen.
export function parseAnswer(raw: string): ParsedAnswer {
  if (!raw) return { text: raw, ungrounded: false, discrepancies: [], screenText: null };

  const screens: string[] = [];
  let text = raw.replace(SCREEN_BLOCK, (_, body: string) => {
    if (body.trim()) screens.push(body.trim());
    return "";
  });

  const discrepancies: string[] = [];
  text = text.replace(DISCREPANCY, (match: string, body: string) => {
    if (match.endsWith("]]") && body.trim()) discrepancies.push(body.trim());
    return "";
  });

  text = withoutPartialMarker(text).trimEnd();
  const grounded = splitUngrounded(text);
  return {
    text: grounded.text,
    ungrounded: grounded.ungrounded,
    discrepancies,
    screenText: screens.length > 0 ? screens.join("\n\n") : null,
  };
}

// The answer as the Candidate would copy, download or resend it: no markers of any kind.
export function cleanAnswer(raw: string): string {
  return parseAnswer(raw).text;
}

// Keeps the Ungrounded and Discrepancy markers (they are shown again when the answer is
// re-rendered) but moves the screen transcription out, to be stored on its own.
export function splitScreenText(raw: string): {
  answer: string;
  screenText: string | null;
} {
  const screenText = parseAnswer(raw).screenText;
  const answer = raw.replace(SCREEN_BLOCK, "").trimEnd();
  return { answer, screenText };
}

function withoutPartialMarker(text: string): string {
  for (const marker of [SCREEN_OPEN, DISCREPANCY_OPEN]) {
    for (let length = marker.length - 1; length >= 2; length--) {
      if (text.endsWith(marker.slice(0, length))) {
        return text.slice(0, -length);
      }
    }
  }
  return text;
}
