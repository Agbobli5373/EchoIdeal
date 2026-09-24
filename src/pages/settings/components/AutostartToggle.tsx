import { Switch, SettingsRow } from "@/components";
import { useApp } from "@/contexts";

export const AutostartToggle = () => {
  const { customizable, toggleAutostart } = useApp();
  const isEnabled = customizable?.autostart?.isEnabled ?? true;

  return (
    <SettingsRow
      id="startup"
      title="Open when your computer starts"
      keywords="launch login autostart startup"
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
