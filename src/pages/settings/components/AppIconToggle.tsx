import { Switch, SettingsRow } from "@/components";
import { useApp } from "@/contexts";
import { defineSettings } from "@/lib/settings-index";

// Registered for settings search (see lib/settings-index).
const SETTINGS = defineSettings("/privacy", {
  stealth: {
    title: "Hide the app icon",
    keywords: "stealth dock taskbar icon",
  },
});

export const AppIconToggle = () => {
  const { customizable, toggleAppIconVisibility } = useApp();
  const isHidden = !customizable.appIcon.isVisible;

  return (
    <SettingsRow
      {...SETTINGS.stealth}
      desc="Keeps EchoIdeal out of the dock or taskbar while it runs."

      control={
        <Switch
          checked={isHidden}
          onCheckedChange={(hide) => toggleAppIconVisibility(!hide)}
          aria-label="Hide the app icon"
        />
      }
    />
  );
};
