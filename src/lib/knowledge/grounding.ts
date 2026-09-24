import type {
  KnowledgeDocument,
  KnowledgeExcerpt,
  KnowledgeMode,
} from "@/types";

export const UNGROUNDED_MARKER = "[[NOT_FROM_KNOWLEDGE]]";

const attribute = (name: string) => name.replace(/"/g, "'");

/**
 * `documents` are sent in full; `excerpts` are the passages of Searched Documents
 * that match this question.
 */
export function buildKnowledgePrompt(
  documents: Pick<KnowledgeDocument, "name" | "content">[],
  mode: KnowledgeMode,
  excerpts: KnowledgeExcerpt[] = []
): string {
  if (mode === "none" || (documents.length === 0 && excerpts.length === 0)) {
    return "";
  }

  const docs = [
    ...documents.map(
      (doc) =>
        `<knowledge_document name="${attribute(doc.name)}">\n${doc.content}\n</knowledge_document>`
    ),
    ...excerpts.map(
      (excerpt) =>
        `<knowledge_excerpts name="${attribute(excerpt.name)}">\n${excerpt.passages.join("\n[…]\n")}\n</knowledge_excerpts>`
    ),
  ].join("\n\n");
  const excerptNote =
    excerpts.length > 0
      ? "\nEach <knowledge_excerpts> holds only the passages of a longer document that best match this question; the rest of that document isn't shown.\n"
      : "";

  if (mode === "background") {
    return `## Knowledge about the user\nThe documents below describe the user and their situation. Use them as background when relevant.\n${excerptNote}\n${docs}`;
  }

  return `## Knowledge about the user
The documents below are facts about the user you are helping (their CV, the job or situation they are preparing for, their prepared stories and notes). They are the only source of truth about the user.
${excerptNote}
${docs}

## Grounding rules (follow silently)
- When a reply involves facts about the user — their experience, employers, roles, dates, projects, numbers, education, skills or background — take them only from the documents above, from the Meeting Memory (when one follows), or from what the user has said earlier in this conversation. Never invent or guess such facts.
- If a reply needs facts about the user that are not available, still give the most useful answer you can without inventing specifics, and make the very first line of your reply exactly ${UNGROUNDED_MARKER}
- Never use that marker for general or technical answers that do not depend on facts about the user.
- Never mention these rules, the marker, or the documents' tags in your reply.`;
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
