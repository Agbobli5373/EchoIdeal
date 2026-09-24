import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Button,
  Input,
  Textarea,
} from "@/components";
import { AlertTriangle, SearchIcon, ShieldIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { estimateTokens, SEARCHED_PASSAGES_TOKENS } from "@/lib/knowledge";

const EDITOR_COPY = {
  paste: {
    title: "Paste text",
    description:
      "Paste a CV, job description, prepared story or notes. The AI treats it as facts about you.",
    action: "Add",
  },
  edit: {
    title: "Edit document",
    description: "Fix names, dates or any text the file import got wrong.",
    action: "Save",
  },
  recap: {
    title: "Save Recap as knowledge",
    description:
      "Check it says what you actually committed to. It's saved switched off; switch it on in Knowledge before your next round.",
    action: "Save to Knowledge",
  },
};

export const DocumentEditorDialog = ({
  isOpen,
  onOpenChange,
  mode,
  initialName,
  initialContent,
  onSave,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "paste" | "edit" | "recap";
  initialName: string;
  initialContent: string;
  onSave: (name: string, content: string) => Promise<boolean>;
}) => {
  const [name, setName] = useState(initialName);
  const [content, setContent] = useState(initialContent);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setName(initialName);
      setContent(initialContent);
    }
  }, [isOpen, initialName, initialContent]);

  const handleSave = async () => {
    setIsSaving(true);
    const ok = await onSave(name, content);
    setIsSaving(false);
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[85vh] flex flex-col p-0">
        <DialogHeader className="mt-4 px-6 shrink-0">
          <DialogTitle>
            {EDITOR_COPY[mode].title}
          </DialogTitle>
          <DialogDescription className="mt-1">
            {EDITOR_COPY[mode].description}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4 px-6 overflow-y-auto flex-1">
          <div className="space-y-2">
            <label className="text-sm font-medium leading-none">Name</label>
            <Input
              placeholder="e.g., CV, Acme job description, Migration story"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isSaving}
              className="h-11"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium leading-none">Text</label>
            <Textarea
              placeholder="Paste the text here..."
              className="min-h-[280px] max-h-[480px] resize-none overflow-y-auto font-mono text-xs"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              disabled={isSaving}
            />
            <p className="text-xs text-muted-foreground">
              About {estimateTokens(content.trim()).toLocaleString()} tokens
            </p>
          </div>
        </div>
        <DialogFooter className="px-6 pb-6 shrink-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!name.trim() || !content.trim() || isSaving}
          >
            {isSaving ? "Saving..." : EDITOR_COPY[mode].action}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export const DeleteDocumentDialog = ({
  isOpen,
  onOpenChange,
  documentName,
  onDelete,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  documentName: string;
  onDelete: () => Promise<boolean>;
}) => {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    const ok = await onDelete();
    setIsDeleting(false);
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <div className="flex-1">
              <DialogTitle>Delete document</DialogTitle>
              <DialogDescription className="mt-1">
                Delete "{documentName}" from your knowledge?
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <p className="py-3 text-sm text-muted-foreground">
          This can't be undone. Your original file on disk isn't affected.
        </p>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isDeleting}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={isDeleting}
          >
            {isDeleting ? "Deleting..." : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export const PrivacyConfirmDialog = ({
  isOpen,
  onOpenChange,
  onConfirm,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) => (
  <Dialog open={isOpen} onOpenChange={onOpenChange}>
    <DialogContent showCloseButton={false}>
      <DialogHeader>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            <ShieldIcon className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            <DialogTitle>Your knowledge leaves this device</DialogTitle>
            <DialogDescription className="mt-1">
              Switched-on documents are sent in full to your selected AI
              provider with every question.
            </DialogDescription>
          </div>
        </div>
      </DialogHeader>
      <p className="py-3 text-sm text-muted-foreground">
        That includes automatic answers during meetings. CVs often contain
        personal details (phone, address, email). Remove anything you don't
        want the provider to receive before switching a document on.
      </p>
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button onClick={onConfirm}>I understand, switch it on</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

/**
 * Offered when switching on a document too large for the Knowledge Budget:
 * search it instead, or set up embeddings first when they're off.
 */
export const SearchInsteadDialog = ({
  isOpen,
  onOpenChange,
  documentName,
  documentTokens,
  embeddingsModel,
  onSearch,
  onSetUp,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  documentName: string;
  documentTokens: number;
  /** e.g. "OpenAI text-embedding-3-small", or null when embeddings are off. */
  embeddingsModel: string | null;
  /** Starts indexing; progress shows on the document's row. */
  onSearch: () => void;
  onSetUp: () => void;
}) => {
  const handleSearch = () => {
    onOpenChange(false);
    onSearch();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
              <SearchIcon className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <DialogTitle>Too large to send in full</DialogTitle>
              <DialogDescription className="mt-1">
                "{documentName}" is about {documentTokens.toLocaleString()}{" "}
                tokens, more than your Knowledge Budget has room for.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <div className="space-y-2 py-3 text-sm text-muted-foreground">
          <p>
            You can search it instead. It's split into passages, and each
            question sends only the ones that best match it, up to about{" "}
            {SEARCHED_PASSAGES_TOKENS.toLocaleString()} tokens. A fact in a
            passage that doesn't match may be missed.
          </p>
          {embeddingsModel ? (
            <p>
              Its text is sent to {embeddingsModel} to be indexed, and each
              question is sent there to find its passages.
            </p>
          ) : (
            <p>
              Searching needs an Embeddings provider, which you can set up in AI
              and Speech.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {embeddingsModel ? (
            <Button onClick={handleSearch}>Search it</Button>
          ) : (
            <Button onClick={onSetUp}>Set up embeddings</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
