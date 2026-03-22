import { useCallback, useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import {
  Button,
  Header,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components";
import {
  getKnowledgeGlobalSettings,
  setKnowledgeGlobalSettings,
  indexKbFolder,
  listKbRoots,
  removeKbRoot,
  safeLocalStorage,
  type GlobalKnowledgeMode,
  type KbRootRow,
} from "@/lib";
import { STORAGE_KEYS } from "@/config";
import { Switch } from "@/components/ui/switch";

const MODE_OPTIONS: { value: GlobalKnowledgeMode; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "local", label: "Local knowledge only" },
  { value: "web", label: "Web search only" },
  { value: "local_web", label: "Local + web" },
];

export const KnowledgeSearchSettings = () => {
  const [defaultMode, setDefaultMode] = useState<GlobalKnowledgeMode>("off");
  const [tavilyKey, setTavilyKey] = useState("");
  const [roots, setRoots] = useState<KbRootRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [auditLog, setAuditLog] = useState(
    () =>
      safeLocalStorage.getItem(STORAGE_KEYS.TRUST_AUDIT_LOG_ENABLED) === "true"
  );

  const load = useCallback(async () => {
    const s = getKnowledgeGlobalSettings();
    setDefaultMode(s.defaultKnowledgeMode);
    setTavilyKey(s.tavilyApiKey ?? "");
    try {
      const r = await listKbRoots();
      setRoots(r);
    } catch {
      setRoots([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const saveSettings = () => {
    setKnowledgeGlobalSettings({
      defaultKnowledgeMode: defaultMode,
      tavilyApiKey: tavilyKey.trim() || undefined,
    });
    setMsg("Settings saved.");
    setTimeout(() => setMsg(null), 2500);
  };

  const pickFolder = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const chosen = await open({ directory: true, multiple: false });
      const path = Array.isArray(chosen) ? chosen[0] : chosen;
      if (!path || typeof path !== "string") {
        setBusy(false);
        return;
      }
      await indexKbFolder(path);
      await load();
      setMsg("Folder indexed.");
      setTimeout(() => setMsg(null), 2500);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Indexing failed");
    } finally {
      setBusy(false);
    }
  };

  const removeRoot = async (id: number) => {
    setBusy(true);
    try {
      await removeKbRoot(id);
      await load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6 border-t border-input/50 pt-6">
      <Header
        title="Knowledge and web search"
        description="Optional retrieval before each chat reply: search your indexed documents (local .md/.txt), Tavily web search, or both. Queries are sent to Tavily when web search is enabled."
      />

      <div className="space-y-2 max-w-md">
        <Label>Default for new chats</Label>
        <Select
          value={defaultMode}
          onValueChange={(v) => setDefaultMode(v as GlobalKnowledgeMode)}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MODE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Each conversation can override this in the chat header.
        </p>
      </div>

      <div className="space-y-2 max-w-md">
        <Label htmlFor="tavily-key">Tavily API key (optional)</Label>
        <Input
          id="tavily-key"
          type="password"
          autoComplete="off"
          placeholder="tvly-…"
          value={tavilyKey}
          onChange={(e) => setTavilyKey(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Get a key at{" "}
          <a
            className="text-primary underline"
            href="https://tavily.com"
            target="_blank"
            rel="noreferrer"
          >
            tavily.com
          </a>
          . Stored only on this device.
        </p>
      </div>

      <Button type="button" onClick={saveSettings} disabled={busy}>
        Save knowledge settings
      </Button>

      <div className="space-y-2">
        <Label>Indexed folders</Label>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={pickFolder}
            disabled={busy}
          >
            Add folder…
          </Button>
        </div>
        {roots.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No folders yet. Add a folder containing .md or .txt files, then
            index.
          </p>
        ) : (
          <ul className="space-y-2 text-sm">
            {roots.map((r) => (
              <li
                key={r.id}
                className="flex flex-col gap-1 rounded-md border border-input/50 p-2 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium">{r.label || r.path}</p>
                  <p className="text-xs text-muted-foreground break-all">
                    {r.path}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="shrink-0 text-destructive"
                  disabled={busy}
                  onClick={() => removeRoot(r.id)}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-3 border-t border-input/50 pt-6 max-w-md">
        <Header
          title="Trust / audit"
          description="Optional local logging of retrieval metadata for assistant replies (model id, knowledge mode, source paths or URLs). Stored only in your SQLite database on this device."
        />
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="trust-audit">Log assistant retrieval metadata</Label>
          <Switch
            id="trust-audit"
            checked={auditLog}
            onCheckedChange={(on) => {
              setAuditLog(on);
              safeLocalStorage.setItem(
                STORAGE_KEYS.TRUST_AUDIT_LOG_ENABLED,
                on ? "true" : "false"
              );
            }}
          />
        </div>
      </div>

      {msg && (
        <p className="text-sm text-muted-foreground" role="status">
          {msg}
        </p>
      )}
    </div>
  );
};
