use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize)]
pub struct KbIndexedFile {
    pub relative_path: String,
    pub chunks: Vec<String>,
}

const CHUNK_SIZE: usize = 900;
const CHUNK_OVERLAP: usize = 150;

fn chunk_text(text: &str) -> Vec<String> {
    let text = text.trim();
    if text.is_empty() {
        return vec![];
    }
    let mut out = Vec::new();
    let mut start = 0;
    while start < text.len() {
        let end = (start + CHUNK_SIZE).min(text.len());
        let slice = if end < text.len() {
            let mut cut = end;
            while cut > start && !text.is_char_boundary(cut) {
                cut -= 1;
            }
            if cut == start {
                cut = end.min(text.len());
                while cut < text.len() && !text.is_char_boundary(cut) {
                    cut += 1;
                }
            }
            &text[start..cut]
        } else {
            &text[start..end]
        };
        let t = slice.trim();
        if !t.is_empty() {
            out.push(t.to_string());
        }
        if end >= text.len() {
            break;
        }
        let next = end.saturating_sub(CHUNK_OVERLAP);
        start = next.max(start + 1);
    }
    if out.is_empty() {
        out.push(text.to_string());
    }
    out
}

fn walk_collect_files(root: &Path, acc: &mut Vec<PathBuf>) -> Result<(), String> {
    let entries = fs::read_dir(root).map_err(|e| format!("Cannot read directory: {}", e))?;
    for entry in entries {
        let entry = entry.map_err(|e| format!("Directory entry: {}", e))?;
        let p = entry.path();
        if p.is_dir() {
            let name = p.file_name().and_then(|n| n.to_str()).unwrap_or("");
            if name.starts_with('.') || name == "node_modules" || name == "target" {
                continue;
            }
            walk_collect_files(&p, acc)?;
        } else if let Some(ext) = p.extension().and_then(|e| e.to_str()) {
            let ext = ext.to_lowercase();
            if ext == "md" || ext == "txt" || ext == "markdown" {
                acc.push(p);
            }
        }
    }
    Ok(())
}

/// Scan a folder for .md/.txt and return chunked text per file (paths relative to root).
#[tauri::command]
pub fn kb_scan_folder(root: String) -> Result<Vec<KbIndexedFile>, String> {
    let root_path = PathBuf::from(&root);
    if !root_path.is_dir() {
        return Err("Path is not a directory".to_string());
    }

    let mut files = Vec::new();
    walk_collect_files(&root_path, &mut files)?;

    let mut out = Vec::new();
    for file in files {
        let rel = file
            .strip_prefix(&root_path)
            .unwrap_or(&file)
            .to_string_lossy()
            .to_string();
        let content = fs::read_to_string(&file).map_err(|e| {
            format!(
                "Failed to read {}: {}",
                file.display(),
                e
            )
        })?;
        let chunks = chunk_text(&content);
        if !chunks.is_empty() {
            out.push(KbIndexedFile {
                relative_path: rel,
                chunks,
            });
        }
    }

    Ok(out)
}
