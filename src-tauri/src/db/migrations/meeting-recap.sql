-- The Knowledge Document a Meeting's Recap was saved as. Deleting the document clears it.
ALTER TABLE meetings ADD COLUMN recap_document_id INTEGER REFERENCES knowledge_documents(id) ON DELETE SET NULL;
