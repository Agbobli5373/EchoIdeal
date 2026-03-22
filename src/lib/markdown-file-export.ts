import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";

/** Fallback when not running in Tauri or when native save is unavailable. */
export function triggerBrowserMarkdownDownload(
  text: string,
  downloadName: string
): void {
  const blob = new Blob([text], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = downloadName;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Save markdown via the system save dialog (Tauri). Falls back to an in-page download otherwise.
 * If the user cancels the dialog, does nothing (no fallback).
 */
export async function saveMarkdownExport(
  text: string,
  defaultFilename: string
): Promise<void> {
  try {
    const path = await save({
      title: "Save export",
      defaultPath: defaultFilename,
      filters: [{ name: "Markdown", extensions: ["md"] }],
    });
    if (!path) return;
    await invoke("export_write_text_file", { path, contents: text });
  } catch {
    triggerBrowserMarkdownDownload(text, defaultFilename);
  }
}
