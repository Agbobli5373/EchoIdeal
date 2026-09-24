import {
  Button,
  Card,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Empty,
  Input,
  Switch,
} from "@/components";
import { useKnowledge } from "@/hooks";
import { PageLayout } from "@/layouts";
import { defineSettings } from "@/lib/settings-index";

// Registered for settings search (see lib/settings-index).
const SETTINGS = defineSettings("/knowledge", {
  budget: {
    title: "Knowledge Budget",
    keywords: "tokens limit active knowledge documents size",
  },
});
import { STORAGE_KEYS } from "@/config";
import { safeLocalStorage } from "@/lib";
import { estimateTokens, KNOWLEDGE_FILE_ACCEPT } from "@/lib/knowledge";
import type { KnowledgeDocument, KnowledgeSourceType } from "@/types";
import {
  BookOpenIcon,
  ClipboardPasteIcon,
  FileTextIcon,
  FileUpIcon,
  ImageIcon,
  Loader2Icon,
  MoreHorizontal,
  Pencil,
  RefreshCwIcon,
  ShieldIcon,
  Trash2,
} from "lucide-react";
import { useRef, useState } from "react";
import {
  DeleteDocumentDialog,
  DocumentEditorDialog,
  PrivacyConfirmDialog,
} from "./dialogs";

const SOURCE_LABELS: Record<KnowledgeSourceType, string> = {
  markdown: "Markdown",
  text: "Text",
  pdf: "PDF",
  image: "Image (converted to text)",
  paste: "Pasted text",
};

const Knowledge = () => {
  const {
    documents,
    isLoading,
    isProcessing,
    error,
    clearError,
    budget,
    activeTokens,
    setBudget,
    addFromFile,
    addFromText,
    replaceFromFile,
    updateDocument,
    setActive,
    deleteDocument,
  } = useKnowledge();

  const uploadInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const [replaceTargetId, setReplaceTargetId] = useState<number | null>(null);
  const [editor, setEditor] = useState<
    { mode: "paste" } | { mode: "edit"; document: KnowledgeDocument } | null
  >(null);
  const [deleteTarget, setDeleteTarget] = useState<KnowledgeDocument | null>(
    null
  );
  const [pendingActivationId, setPendingActivationId] = useState<number | null>(
    null
  );
  const [budgetDraft, setBudgetDraft] = useState<string | null>(null);

  const handleUpload = async (files: FileList | null) => {
    if (!files) return;
    for (const file of Array.from(files)) {
      const ok = await addFromFile(file);
      if (!ok) break;
    }
  };

  const handleReplace = async (files: FileList | null) => {
    const file = files?.[0];
    if (file && replaceTargetId !== null) {
      await replaceFromFile(replaceTargetId, file);
    }
    setReplaceTargetId(null);
  };

  const handleToggle = (doc: KnowledgeDocument, checked: boolean) => {
    if (
      checked &&
      safeLocalStorage.getItem(STORAGE_KEYS.KNOWLEDGE_PRIVACY_ACKNOWLEDGED) !==
        "true"
    ) {
      setPendingActivationId(doc.id);
      return;
    }
    setActive(doc.id, checked);
  };

  const confirmPrivacy = () => {
    safeLocalStorage.setItem(
      STORAGE_KEYS.KNOWLEDGE_PRIVACY_ACKNOWLEDGED,
      "true"
    );
    if (pendingActivationId !== null) setActive(pendingActivationId, true);
    setPendingActivationId(null);
  };

  const commitBudget = () => {
    if (budgetDraft === null) return;
    setBudget(Number(budgetDraft));
    setBudgetDraft(null);
  };

  const usage = Math.min(100, (activeTokens / budget) * 100);
  const activeCount = documents.filter((doc) => doc.is_active).length;

  return (
    <PageLayout
      title="Knowledge"
      subtitle="Documents the AI treats as facts about you."
      actions={
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setEditor({ mode: "paste" })}
            disabled={isProcessing}
          >
            <ClipboardPasteIcon className="size-4" />
            Paste text
          </Button>
          <Button
            onClick={() => uploadInputRef.current?.click()}
            disabled={isProcessing}
          >
            {isProcessing ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <FileUpIcon className="size-4" />
            )}
            Upload file
          </Button>
        </div>
      }
    >
      <input
        ref={uploadInputRef}
        type="file"
        multiple
        accept={KNOWLEDGE_FILE_ACCEPT}
        className="hidden"
        onChange={(e) => {
          handleUpload(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={replaceInputRef}
        type="file"
        accept={KNOWLEDGE_FILE_ACCEPT}
        className="hidden"
        onChange={(e) => {
          handleReplace(e.target.files);
          e.target.value = "";
        }}
      />

      <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-muted/40 p-3 text-xs text-muted-foreground">
        <ShieldIcon className="size-4 shrink-0 mt-0.5" />
        <p>
          Switched-on documents are sent to your selected AI provider with each
          question. Upload .md, .txt, PDF or image files, or paste text. Files
          are copied in; editing the original on disk won't change them.
        </p>
      </div>

      {error && (
        <div className="flex items-start justify-between gap-3 rounded-lg border border-destructive/20 bg-destructive/10 p-3">
          <p className="text-sm text-destructive">{error}</p>
          <button
            className="text-xs text-destructive/80 hover:text-destructive"
            onClick={clearError}
          >
            Dismiss
          </button>
        </div>
      )}

      <Card
        id={SETTINGS.budget.id}
        className="shadow-none p-4 gap-3 !bg-black/5 dark:!bg-white/5 border-transparent"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Knowledge Budget</p>
            <p className="text-xs text-muted-foreground">
              {activeCount} active · about {activeTokens.toLocaleString()} of{" "}
              {budget.toLocaleString()} tokens used. Documents over the budget
              can't be switched on.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={1000}
              step={1000}
              className="h-8 w-28 text-xs"
              value={budgetDraft ?? String(budget)}
              onChange={(e) => setBudgetDraft(e.target.value)}
              onBlur={commitBudget}
              onKeyDown={(e) => e.key === "Enter" && commitBudget()}
              aria-label="Knowledge Budget in tokens"
            />
            <span className="text-xs text-muted-foreground">tokens</span>
          </div>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
          <div
            className={`h-full rounded-full transition-all ${
              usage > 90 ? "bg-amber-500" : "bg-primary"
            }`}
            style={{ width: `${usage}%` }}
          />
        </div>
      </Card>

      {documents.length === 0 ? (
        <Empty
          isLoading={isLoading}
          icon={BookOpenIcon}
          title="No knowledge yet"
          description="Upload your CV or a job description, or paste your notes, so answers use your real background."
        />
      ) : (
        <div className="flex flex-col gap-2">
          {documents.map((doc) => (
            <Card
              key={doc.id}
              className={`flex flex-row items-center gap-3 p-3 shadow-none border ${
                doc.is_active
                  ? "!bg-primary/5 dark:!bg-primary/10 border-primary/40"
                  : "!bg-black/5 dark:!bg-white/5 border-transparent"
              }`}
            >
              {doc.source_type === "image" ? (
                <ImageIcon className="size-5 shrink-0 text-muted-foreground" />
              ) : (
                <FileTextIcon className="size-5 shrink-0 text-muted-foreground" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{doc.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {SOURCE_LABELS[doc.source_type]} · about{" "}
                  {estimateTokens(doc.content).toLocaleString()} tokens ·
                  updated {doc.updated_at}
                </p>
              </div>
              <Switch
                checked={doc.is_active}
                disabled={isProcessing}
                onCheckedChange={(checked) => handleToggle(doc, checked)}
                aria-label={`Use ${doc.name} as knowledge`}
              />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="flex size-8 items-center justify-center rounded-xl hover:bg-accent"
                    aria-label={`Actions for ${doc.name}`}
                  >
                    <MoreHorizontal className="size-4 text-muted-foreground" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuItem
                    onClick={() => setEditor({ mode: "edit", document: doc })}
                  >
                    <Pencil className="size-4 mr-2" />
                    Edit text
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      setReplaceTargetId(doc.id);
                      replaceInputRef.current?.click();
                    }}
                  >
                    <RefreshCwIcon className="size-4 mr-2" />
                    Replace from file
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => setDeleteTarget(doc)}
                  >
                    <Trash2 className="size-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </Card>
          ))}
        </div>
      )}

      <DocumentEditorDialog
        isOpen={editor !== null}
        onOpenChange={(open) => !open && setEditor(null)}
        mode={editor?.mode ?? "paste"}
        initialName={editor?.mode === "edit" ? editor.document.name : ""}
        initialContent={editor?.mode === "edit" ? editor.document.content : ""}
        onSave={(name, content) =>
          editor?.mode === "edit"
            ? updateDocument(editor.document.id, { name, content })
            : addFromText(name, content)
        }
      />

      <DeleteDocumentDialog
        isOpen={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        documentName={deleteTarget?.name ?? ""}
        onDelete={() =>
          deleteTarget ? deleteDocument(deleteTarget.id) : Promise.resolve(true)
        }
      />

      <PrivacyConfirmDialog
        isOpen={pendingActivationId !== null}
        onOpenChange={(open) => !open && setPendingActivationId(null)}
        onConfirm={confirmPrivacy}
      />
    </PageLayout>
  );
};

export default Knowledge;
