import { useState, useEffect } from "react";
import { SettingsRow, Switch } from "@/components";
import { getResponseSettings, updateAutoScroll } from "@/lib";

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
      id="follow"
      title="Keep the latest answer in view"
      desc="Scrolls the overlay as an answer streams in."
      keywords="auto scroll follow response"
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
