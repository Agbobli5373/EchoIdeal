// About 300 tokens: small enough that several fit the passage room, big enough to
// keep a fact together with what explains it.
const TARGET_CHARACTERS = 1200;
// Each passage repeats the end of the one before, so a fact split at a boundary is
// still whole in one of them.
const OVERLAP_CHARACTERS = 150;

const HEADING = /^#{1,6}\s+\S/;

/** Splits `text` into long pieces at sentence ends, or at spaces when a sentence is too long. */
function splitLong(text: string, max: number): string[] {
  const pieces: string[] = [];
  let rest = text.trim();
  while (rest.length > max) {
    const window = rest.slice(0, max);
    const sentenceEnd = Math.max(
      window.lastIndexOf(". "),
      window.lastIndexOf("? "),
      window.lastIndexOf("! "),
      window.lastIndexOf("\n")
    );
    const space = window.lastIndexOf(" ");
    const cut =
      sentenceEnd > max / 2 ? sentenceEnd + 1 : space > max / 2 ? space : max;
    pieces.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) pieces.push(rest);
  return pieces;
}

/** The last `length` characters of `text`, starting at a word. */
function tail(text: string, length: number): string {
  if (text.length <= length) return text;
  const start = text.indexOf(" ", text.length - length);
  return start === -1 ? "" : text.slice(start + 1);
}

/**
 * Splits a document into passages of about TARGET_CHARACTERS, keeping paragraphs
 * together where they fit. A passage under a Markdown heading starts with that
 * heading, so it still says what it's about when read on its own.
 */
export function splitIntoPassages(text: string): string[] {
  const paragraphs = text
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  const passages: string[] = [];
  let heading = "";
  let current = "";
  let previous = "";

  const flush = () => {
    const body = current.trim();
    if (!body) return;
    const overlap = previous ? tail(previous, OVERLAP_CHARACTERS) : "";
    const withContext = [
      heading && !body.startsWith(heading) ? heading : "",
      overlap ? `…${overlap}` : "",
      body,
    ]
      .filter(Boolean)
      .join("\n");
    passages.push(withContext);
    previous = body;
    current = "";
  };

  for (const paragraph of paragraphs) {
    const firstLine = paragraph.split("\n")[0];
    if (HEADING.test(firstLine)) {
      flush();
      // A new section doesn't carry the last section's text over.
      previous = "";
      heading = firstLine.trim();
    }

    for (const piece of splitLong(paragraph, TARGET_CHARACTERS)) {
      if (current && current.length + piece.length + 2 > TARGET_CHARACTERS) {
        flush();
      }
      current = current ? `${current}\n\n${piece}` : piece;
    }
  }
  flush();
  return passages;
}
