import { Switch, Label, Header } from "@/components";
import { useApp } from "@/contexts";
import { getPlatform } from "@/lib";

interface ScreenShareToggleProps {
  className?: string;
}

export const ScreenShareToggle = ({ className }: ScreenShareToggleProps) => {
  const { customizable, toggleScreenShareVisibility } = useApp();
  const platform = getPlatform();

  const isVisible = customizable.screenShareVisible?.isEnabled ?? false;

  const handleSwitchChange = async (checked: boolean) => {
    await toggleScreenShareVisibility(checked);
  };

  return (
    <div id="screen-share-visibility" className={`space-y-2 ${className}`}>
      <Header
        title="Screen Share Visibility"
        description="Control whether EchoIdeal appears in screenshots, recordings, and screen shares"
        isMainTitle
      />
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div>
            <Label className="text-sm font-medium">
              {isVisible
                ? "Visible in Screen Shares"
                : "Hidden from Screen Shares"}
            </Label>
            <p className="text-xs text-muted-foreground mt-1">
              {isVisible
                ? "EchoIdeal will appear in screenshots, recordings, and screen shares."
                : "EchoIdeal is invisible in screenshots, recordings, and screen shares (stealth mode)."}
            </p>
            {platform === "linux" && (
              <p className="text-xs text-muted-foreground/60 mt-1">
                Note: Screen share protection is not supported on Linux.
              </p>
            )}
          </div>
        </div>
        <Switch
          checked={isVisible}
          onCheckedChange={handleSwitchChange}
          title={isVisible ? "Make invisible in screen shares" : "Make visible in screen shares"}
          aria-label="Toggle screen share visibility"
        />
      </div>
    </div>
  );
};
