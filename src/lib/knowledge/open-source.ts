import { openPath, openUrl } from "@tauri-apps/plugin-opener";

/** Open a knowledge source string (file path or http(s) URL). */
export async function openKnowledgeSource(raw: string): Promise<void> {
  const s = raw.trim();
  if (!s) return;
  if (/^https?:\/\//i.test(s)) {
    await openUrl(s);
    return;
  }
  await openPath(s);
}
