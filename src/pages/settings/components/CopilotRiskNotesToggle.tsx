import { Switch, Label, Header } from "@/components";
import { STORAGE_KEYS, COPILOT_RISK_NOTES_CHANGED_EVENT } from "@/config";
import { safeLocalStorage } from "@/lib";
import { useCallback, useState } from "react";

export const CopilotRiskNotesToggle = () => {
  const [visible, setVisible] = useState(
    () => safeLocalStorage.getItem(STORAGE_KEYS.COPILOT_RISK_NOTES_VISIBLE) === "true"
  );

  const onChange = useCallback((checked: boolean) => {
    setVisible(checked);
    safeLocalStorage.setItem(
      STORAGE_KEYS.COPILOT_RISK_NOTES_VISIBLE,
      checked ? "true" : "false"
    );
    window.dispatchEvent(
      new CustomEvent(COPILOT_RISK_NOTES_CHANGED_EVENT, { detail: checked })
    );
  }, []);

  return (
    <div className="space-y-2 border-t border-input/50 pt-6">
      <Header
        title="Meeting copilot reminders"
        description="Optional short notes about token use, privacy, and screen-based AI on the Playbook tab."
      />
      <div className="flex max-w-xl items-center justify-between gap-4">
        <div>
          <Label htmlFor="risk-notes" className="text-sm font-medium">
            Show risk reminders on Playbook
          </Label>
          <p className="mt-1 text-xs text-muted-foreground">
            Off by default. Turn on if you want a collapsible reminder about
            playbook/trigger cost, sending transcript text to your AI provider,
            and using a vision-capable model for fusion assist.
          </p>
        </div>
        <Switch
          id="risk-notes"
          checked={visible}
          onCheckedChange={onChange}
          aria-label="Toggle meeting copilot risk reminders"
        />
      </div>
    </div>
  );
};
