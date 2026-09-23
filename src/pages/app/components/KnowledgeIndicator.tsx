import { useEffect, useState } from "react";
import { BookOpenIcon } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { STORAGE_KEYS } from "@/config";
import { getActiveKnowledgeDocuments } from "@/lib/database";

export const KnowledgeIndicator = () => {
  const [activeCount, setActiveCount] = useState(0);

  useEffect(() => {
    const refresh = () =>
      getActiveKnowledgeDocuments()
        .then((docs) => setActiveCount(docs.length))
        .catch((error) =>
          console.error("Failed to load Active Knowledge:", error)
        );

    refresh();
    // The dashboard window publishes changes through localStorage.
    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEYS.KNOWLEDGE_ACTIVE_COUNT) refresh();
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  if (activeCount === 0) return null;

  return (
    <button
      type="button"
      className="flex h-7 shrink-0 items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 text-[11px] font-medium text-primary hover:bg-primary/15"
      title={`${activeCount} knowledge document${activeCount === 1 ? "" : "s"} active. Open the dashboard to manage them.`}
      onClick={() => invoke("open_dashboard").catch(console.error)}
    >
      <BookOpenIcon className="size-3" />
      {activeCount}
    </button>
  );
};
