import { Switch, SettingsRow } from "@/components";
import { useApp } from "@/contexts";
import { defineSettings } from "@/lib/settings-index";

// Registered for settings search (see lib/settings-index).
const SETTINGS = defineSettings("/general", {
  ontop: { title: "Keep the overlay on top", keywords: "always on top window" },
});

export const AlwaysOnTopToggle = () => {
  const { customizable, toggleAlwaysOnTop } = useApp();

  return (
    <SettingsRow
      {...SETTINGS.ontop}
      desc="The overlay stays above your other windows."

      control={
        <Switch
          checked={customizable.alwaysOnTop.isEnabled}
          onCheckedChange={(checked) => toggleAlwaysOnTop(checked)}
          aria-label="Keep the overlay on top"
        />
      }
    />
  );
};
