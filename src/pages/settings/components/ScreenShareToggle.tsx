import { Switch, SettingsRow } from "@/components";
import { useApp } from "@/contexts";
import { getPlatform } from "@/lib";
import { defineSettings } from "@/lib/settings-index";

// Registered for settings search (see lib/settings-index).
const SETTINGS = defineSettings("/privacy", {
  visible: {
    title: "Visible in screen shares",
    keywords: "screen share content protection recording stealth",
  },
});

export const ScreenShareToggle = () => {
  const { customizable, toggleScreenShareVisibility } = useApp();
  const isVisible = customizable.screenShareVisible?.isEnabled ?? false;

  return (
    <SettingsRow
      {...SETTINGS.visible}
      desc={
        <>
          When off, EchoIdeal doesn’t appear in screenshots, recordings or
          screen shares.
          {getPlatform() === "linux" && " Hiding isn’t supported on Linux."}
        </>
      }
      control={
        <Switch
          checked={isVisible}
          onCheckedChange={(checked) => toggleScreenShareVisibility(checked)}
          aria-label="Visible in screen shares"
        />
      }
    />
  );
};
