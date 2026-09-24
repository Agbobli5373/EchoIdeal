import { Switch, SettingsRow } from "@/components";
import { useApp } from "@/contexts";

export const AlwaysOnTopToggle = () => {
  const { customizable, toggleAlwaysOnTop } = useApp();

  return (
    <SettingsRow
      id="ontop"
      title="Keep the overlay on top"
      desc="The overlay stays above your other windows."
      keywords="always on top window"
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
