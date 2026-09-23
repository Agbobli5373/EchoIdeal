# Active Knowledge is sent in full, capped by a Knowledge Budget

Knowledge Documents are small, personal and high-value (a CV, a job description, a few prepared stories), so the full text of all Active Knowledge is included in every AI request instead of retrieving passages with embeddings. A hard Knowledge Budget (configurable; default about 12k tokens) prevents a document from being switched on when it would exceed it. Silent truncation is not allowed, because it would make the AI mark facts it never saw as Ungrounded.

## Considered Options

- **Retrieval (embeddings/RAG)**: rejected for now. The app has no embeddings provider across its ten AI providers and user-defined curl providers, and retrieval can miss the one fact a follow-up needs. Revisit only if users routinely hit the Knowledge Budget with large reference material.
- **Truncate to fit**: rejected. It breaks the guarantee behind the Ungrounded marker.
