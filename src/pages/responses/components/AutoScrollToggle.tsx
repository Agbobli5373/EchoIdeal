import { useState, useEffect } from "react";
import { SettingsRow, Switch } from "@/components";
import { getResponseSettings, updateAutoScroll } from "@/lib";
import { defineSettings } from "@/lib/settings-index";

// Registered for settings search (see lib/settings-index).
const SETTINGS = defineSettings("/prompts", {
  follow: {
    title: "Keep the latest answer in view",
    group: "Answer style",
    keywords: "auto scroll follow response",
  },
});

export const AutoScrollToggle = () => {
  const [autoScroll, setAutoScroll] = useState<boolean>(true);

  useEffect(() => {
    setAutoScroll(getResponseSettings().autoScroll);
  }, []);

  const handleSwitchChange = (checked: boolean) => {
    setAutoScroll(checked);
    updateAutoScroll(checked);
  };

  return (
    <SettingsRow
      {...SETTINGS.follow}
      desc="Scrolls the overlay as an answer streams in."

      control={
        <Switch
          checked={autoScroll}
          onCheckedChange={handleSwitchChange}
          aria-label="Keep the latest answer in view"
        />
      }
    />
  );
};
