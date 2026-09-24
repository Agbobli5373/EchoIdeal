import { Switch, SettingsRow } from "@/components";
import { useApp } from "@/contexts";

export const AppIconToggle = () => {
  const { customizable, toggleAppIconVisibility } = useApp();
  const isHidden = !customizable.appIcon.isVisible;

  return (
    <SettingsRow
      id="stealth"
      title="Hide the app icon"
      desc="Keeps EchoIdeal out of the dock or taskbar while it runs."
      keywords="stealth dock taskbar icon"
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
