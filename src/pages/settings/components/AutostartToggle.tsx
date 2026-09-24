import { Switch, SettingsRow } from "@/components";
import { useApp } from "@/contexts";
import { defineSettings } from "@/lib/settings-index";

// Registered for settings search (see lib/settings-index).
const SETTINGS = defineSettings("/general", {
  startup: {
    title: "Open when your computer starts",
    keywords: "launch login autostart startup",
  },
});

export const AutostartToggle = () => {
  const { customizable, toggleAutostart } = useApp();
  const isEnabled = customizable?.autostart?.isEnabled ?? true;

  return (
    <SettingsRow
      {...SETTINGS.startup}

      control={
        <Switch
          checked={isEnabled}
          onCheckedChange={(checked) => toggleAutostart(checked)}
          aria-label="Open when your computer starts"
        />
      }
    />
  );
};
