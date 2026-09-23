import type { KnowledgeSourceType, TYPE_PROVIDER } from "@/types";
import { fetchAIResponse } from "../functions/ai-response.function";

export const KNOWLEDGE_FILE_ACCEPT =
  ".md,.markdown,.txt,.pdf,application/pdf,image/png,image/jpeg,image/webp,image/gif";

// Fewer visible characters than this means the file has no usable text (e.g. a scanned PDF).
const MIN_TEXT_CHARACTERS = 20;

export class NoTextFoundError extends Error {
  constructor(kind: "pdf" | "file" | "image") {
    super(
      kind === "pdf"
        ? "No text found in this PDF (it may be a scanned image). Paste the text instead."
        : kind === "image"
          ? "No text could be read from this image. Paste the text instead."
          : "No text found in this file. Paste the text instead."
    );
    this.name = "NoTextFoundError";
  }
}

export type ImageTranscriber = (
  base64: string,
  mimeType: string
) => Promise<string>;

export function detectKnowledgeSourceType(
  file: File
): KnowledgeSourceType | null {
  const name = file.name.toLowerCase();
  if (name.endsWith(".md") || name.endsWith(".markdown")) return "markdown";
  if (name.endsWith(".txt") || file.type === "text/plain") return "text";
  if (name.endsWith(".pdf") || file.type === "application/pdf") return "pdf";
  if (file.type.startsWith("image/")) return "image";
  return null;
}

function hasEnoughText(text: string): boolean {
  return text.replace(/\s/g, "").length >= MIN_TEXT_CHARACTERS;
}

async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url"))
    .default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const loadingTask = pdfjs.getDocument({ data: await file.arrayBuffer() });
  const pdf = await loadingTask.promise;
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    let pageText = "";
    for (const item of content.items) {
      if ("str" in item) {
        pageText += item.str + (item.hasEOL ? "\n" : " ");
      }
    }
    pages.push(pageText.replace(/[ \t]+\n/g, "\n").trim());
  }
  await loadingTask.destroy();
  return pages.filter(Boolean).join("\n\n");
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve(((reader.result as string) ?? "").split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export async function extractKnowledgeText(
  file: File,
  transcribeImage: ImageTranscriber
): Promise<{ sourceType: KnowledgeSourceType; content: string }> {
  const sourceType = detectKnowledgeSourceType(file);
  if (!sourceType) {
    throw new Error(
      "Unsupported file type. Upload a .md, .txt, PDF or image file, or paste the text."
    );
  }

  let content: string;
  if (sourceType === "pdf") {
    content = await extractPdfText(file);
    if (!hasEnoughText(content)) throw new NoTextFoundError("pdf");
  } else if (sourceType === "image") {
    content = await transcribeImage(await fileToBase64(file), file.type);
    if (!hasEnoughText(content)) throw new NoTextFoundError("image");
  } else {
    content = await file.text();
    if (!hasEnoughText(content)) throw new NoTextFoundError("file");
  }

  return { sourceType, content: content.trim() };
}

const TRANSCRIBE_SYSTEM_PROMPT =
  "You convert images into plain text. Transcribe all text in the image faithfully, preserving headings, lists and structure as Markdown. Describe any important non-text content (charts, diagrams) briefly in brackets. Output only the transcription — no commentary.";

// fetchAIResponse reports provider failures as yielded text rather than throwing.
const PROVIDER_ERROR_PREFIXES = [
  "API request failed",
  "Network error",
  "EchoIdeal API Error",
  "Failed to parse",
  "Error reading stream",
  "Streaming not supported",
];

export async function transcribeImageWithProvider(params: {
  provider: TYPE_PROVIDER | undefined;
  selectedProvider: { provider: string; variables: Record<string, string> };
  base64: string;
}): Promise<string> {
  let text = "";
  for await (const chunk of fetchAIResponse({
    provider: params.provider,
    selectedProvider: params.selectedProvider,
    systemPrompt: TRANSCRIBE_SYSTEM_PROMPT,
    userMessage: "Transcribe this image.",
    imagesBase64: [params.base64],
    knowledgeMode: "none",
  })) {
    text += chunk;
  }

  const trimmed = text.trim();
  if (PROVIDER_ERROR_PREFIXES.some((prefix) => trimmed.startsWith(prefix))) {
    throw new Error(
      `Your AI provider couldn't read the image: ${trimmed.slice(0, 200)}`
    );
  }
  return trimmed;
}
