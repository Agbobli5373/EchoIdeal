import { useState, useEffect } from "react";
import { Button, Keys, SettingsGroup, SettingsRow, Switch } from "@/components";
import { RotateCcw, AlertCircle } from "lucide-react";
import {
  getAllShortcutActions,
  getShortcutsConfig,
  updateShortcutBinding,
  resetShortcutsToDefaults,
  checkShortcutConflicts,
  formatShortcutKeyForDisplay,
  getPlatformDefaultKey,
} from "@/lib";
import { ShortcutAction, ShortcutBinding } from "@/types";
import { invoke } from "@tauri-apps/api/core";
import { ShortcutRecorder } from "./ShortcutRecorder";
import { DEFAULT_SHORTCUT_ACTIONS } from "@/config";
import { defineSettings } from "@/lib/settings-index";

const shortcutRowId = (actionId: string) => `sc-${actionId.replace(/_/g, "-")}`;

// Registered for settings search (see lib/settings-index): one row per built-in shortcut.
defineSettings(
  "/shortcuts-and-cursor",
  Object.fromEntries(
    DEFAULT_SHORTCUT_ACTIONS.map((action) => [
      shortcutRowId(action.id),
      {
        title: action.name,
        group: "Shortcuts",
        keywords: `shortcut hotkey keyboard ${action.description}`,
      },
    ])
  )
);

export const ShortcutManager = () => {
  const [actions, setActions] = useState<ShortcutAction[]>([]);
  const [bindings, setBindings] = useState<Record<string, ShortcutBinding>>({});
  const [editingAction, setEditingAction] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<string[]>([]);
  const [isApplying, setIsApplying] = useState(false);

  useEffect(() => {
    loadShortcuts();
  }, []);

  const loadShortcuts = () => {
    const config = getShortcutsConfig();
    const allActions = getAllShortcutActions();
    setActions(allActions);
    setBindings(config.bindings);
  };

  const handleToggleEnabled = async (actionId: string, enabled: boolean) => {
    const binding = bindings[actionId];
    if (!binding) return;

    const newBinding = { ...binding, enabled };
    const updatedBindings = { ...bindings, [actionId]: newBinding };
    setBindings(updatedBindings);

    // Update storage
    updateShortcutBinding(actionId, binding.key, enabled);

    // Apply to backend
    await applyShortcuts(updatedBindings);
  };

  const handleSaveShortcut = async (actionId: string, key: string) => {
    // Check for conflicts
    const conflict = checkShortcutConflicts(key, actionId);
    if (conflict) {
      setConflicts([
        `Shortcut "${key}" is already used by: ${conflict.actions
          .map((id) => actions.find((a) => a.id === id)?.name)
          .join(", ")}`,
      ]);
      return;
    }

    const binding = bindings[actionId] || {
      action: actionId,
      key: "",
      enabled: true,
    };
    const newBinding = { ...binding, key };
    const updatedBindings = { ...bindings, [actionId]: newBinding };
    setBindings(updatedBindings);

    // Update storage
    updateShortcutBinding(actionId, key, binding.enabled);

    // Apply to backend
    await applyShortcuts(updatedBindings);

    // Close editor and clear conflicts
    setEditingAction(null);
    setConflicts([]);
  };

  const applyShortcuts = async (
    updatedBindings: Record<string, ShortcutBinding>
  ) => {
    setIsApplying(true);
    try {
      await invoke("update_shortcuts", {
        config: { bindings: updatedBindings },
      });
    } catch (error) {
      console.error("Failed to apply shortcuts:", error);
      setConflicts([`Failed to apply shortcuts: ${error}`]);
    } finally {
      setIsApplying(false);
    }
  };

  const handleReset = async () => {
    setIsApplying(true);
    try {
      const defaultConfig = resetShortcutsToDefaults();

      await applyShortcuts(defaultConfig.bindings);

      setBindings(defaultConfig.bindings);
      setConflicts([]);
      setEditingAction(null);

      // Reload to ensure fresh state
      loadShortcuts();
    } catch (error) {
      console.error("Failed to reset shortcuts:", error);
      setConflicts(["Failed to reset shortcuts. Please try again."]);
    } finally {
      setIsApplying(false);
    }
  };

  // "ctrl+shift+m" → ["Ctrl", "Shift", "M"]
  const keysOf = (action: ShortcutAction, key: string) => {
    const keys = formatShortcutKeyForDisplay(key).split(" + ").filter(Boolean);
    return action.id === "move_window" ? [...keys, "Arrow keys"] : keys;
  };

  return (
    <SettingsGroup
      title="Shortcuts"
      meta={
        <Button
          size="sm"
          variant="ghost"
          onClick={handleReset}
          disabled={isApplying}
          title="Reset all shortcuts to platform defaults"
          className="h-7 gap-1.5 text-muted-foreground"
        >
          <RotateCcw className="size-3.5" />
          Reset all
        </Button>
      }
    >
      {conflicts.length > 0 && (
        <div className="flex items-start gap-2 bg-destructive/10 px-4 py-3">
          <AlertCircle className="mt-0.5 size-4 text-destructive" />
          <div className="flex-1">
            {conflicts.map((conflict, i) => (
              <p key={i} className="text-sm text-destructive">
                {conflict}
              </p>
            ))}
          </div>
        </div>
      )}

      {actions.map((action) => {
        const binding = bindings[action.id] || {
          action: action.id,
          key: getPlatformDefaultKey(action),
          enabled: true,
        };
        const isEditing = editingAction === action.id;

        return (
          <SettingsRow
            key={action.id}
            id={shortcutRowId(action.id)}
            title={action.name}
            desc={action.description}
            stacked={isEditing}
            control={
              isEditing ? undefined : (
                <>
                  <span className={binding.enabled ? "" : "opacity-50"}>
                    <Keys keys={keysOf(action, binding.key)} />
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditingAction(action.id);
                      setConflicts([]);
                    }}
                    disabled={isApplying}
                    title="Change this shortcut"
                  >
                    Change
                  </Button>
                  <Switch
                    checked={binding.enabled}
                    onCheckedChange={(enabled) =>
                      handleToggleEnabled(action.id, enabled)
                    }
                    disabled={isApplying}
                    aria-label={`${action.name} shortcut on`}
                  />
                </>
              )
            }
          >
            {isEditing && (
              <ShortcutRecorder
                actionId={action.id}
                onSave={(key) => handleSaveShortcut(action.id, key)}
                onCancel={() => {
                  setEditingAction(null);
                  setConflicts([]);
                }}
                disabled={isApplying}
              />
            )}
          </SettingsRow>
        );
      })}
    </SettingsGroup>
  );
};
