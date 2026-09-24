# Documents too large for the Knowledge Budget can be searched, with an optional Embeddings Provider

Amends [0001](0001-full-text-knowledge-with-budget.md). Active Knowledge is still sent in full by default, and a document that fits is always sent in full. When switching a document on would exceed the Knowledge Budget, the Candidate can make it a Searched Document instead: it is split into passages of about 300 tokens, each passage is embedded once by an Embeddings Provider the Candidate sets up, and each question (with the question before it, for follow-ups) is embedded so that only the best-matching passages, up to a fixed room of about 2,000 tokens, are sent. That room counts against the Knowledge Budget while any document is searched.

The Embeddings Provider is configured separately from the AI provider (OpenAI, Gemini, Mistral, Cohere, OpenRouter, Ollama or any OpenAI-compatible server), because most of the chat providers the app supports (Claude, Grok, Groq, Perplexity, custom curl providers) have no embeddings API. It is optional: without it nothing changes from 0001, and a document over the budget is refused as before.

This weakens 0001's guarantee for Searched Documents only: the AI sees the passages sent, not the whole document, so a fact in a passage that didn't match can be missed and the answer marked Ungrounded. The Candidate is told this before a document is searched. If the question can't be embedded in time (offline, bad key), the answer goes ahead without passages rather than being blocked.

## Considered Options

- **A local embedding model in the app (ONNX)**: rejected by the Candidate in favour of a provider, to keep the build and download small.
- **Keyword search (SQLite FTS5)**: rejected, because it misses the same fact phrased differently ("led a team" vs "managed engineers").
- **Searching every large document automatically above a size threshold**: rejected, because a long CV would lose facts that full text keeps; only documents that can't be sent in full are searched, and only when the Candidate chooses.
- **A vector database or SQLite vector extension**: not needed at this size. Vectors are stored with their passages in SQLite and compared in memory.
