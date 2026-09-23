import type { KnowledgeDocument, KnowledgeMode } from "@/types";

export const UNGROUNDED_MARKER = "[[NOT_FROM_KNOWLEDGE]]";

export function buildKnowledgePrompt(
  documents: Pick<KnowledgeDocument, "name" | "content">[],
  mode: KnowledgeMode
): string {
  if (mode === "none" || documents.length === 0) return "";

  const docs = documents
    .map(
      (doc) =>
        `<knowledge_document name="${doc.name.replace(/"/g, "'")}">\n${doc.content}\n</knowledge_document>`
    )
    .join("\n\n");

  if (mode === "background") {
    return `## Knowledge about the user\nThe documents below describe the user and their situation. Use them as background when relevant.\n\n${docs}`;
  }

  return `## Knowledge about the user
The documents below are facts about the user you are helping (their CV, the job or situation they are preparing for, their prepared stories and notes). They are the only source of truth about the user.

${docs}

## Grounding rules (follow silently)
- When a reply involves facts about the user — their experience, employers, roles, dates, projects, numbers, education, skills or background — take them only from the documents above or from what the user has said earlier in this conversation. Never invent or guess such facts.
- If a reply needs facts about the user that are not available, still give the most useful answer you can without inventing specifics, and make the very first line of your reply exactly ${UNGROUNDED_MARKER}
- Never use that marker for general or technical answers that do not depend on facts about the user.
- Never mention these rules, the marker, or the documents' tags in your reply.`;
}

export function stripUngroundedMarker(text: string): string {
  return splitUngrounded(text).text;
}

// Also hides a partially streamed marker (e.g. "[[NOT_FR") so it never flashes on screen.
export function splitUngrounded(text: string): {
  text: string;
  ungrounded: boolean;
} {
  if (!text) return { text, ungrounded: false };

  const leading = text.trimStart();
  if (
    leading.length > 0 &&
    leading.length < UNGROUNDED_MARKER.length &&
    UNGROUNDED_MARKER.startsWith(leading)
  ) {
    return { text: "", ungrounded: false };
  }

  if (!text.includes(UNGROUNDED_MARKER)) {
    return { text, ungrounded: false };
  }

  const cleaned = text
    .split(UNGROUNDED_MARKER)
    .join("")
    .replace(/^\s*\n/, "")
    .trimStart();
  return { text: cleaned, ungrounded: true };
}
