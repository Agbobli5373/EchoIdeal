import { Switch, Label, Header } from "@/components";
import { useApp } from "@/contexts";

interface OverlayVisibilityToggleProps {
  className?: string;
}

export const OverlayVisibilityToggle = ({
  className,
}: OverlayVisibilityToggleProps) => {
  const { customizable, toggleOverlayVisibility } = useApp();

  const isVisible = customizable.overlay?.isVisible ?? false;

  const handleSwitchChange = async (checked: boolean) => {
    await toggleOverlayVisibility(checked);
  };

  return (
    <div id="overlay-visibility" className={`space-y-2 ${className}`}>
      <Header
        title="Overlay Bar Visibility"
        description="Control whether the floating AI assistant bar is shown on screen"
        isMainTitle
      />
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div>
            <Label className="text-sm font-medium">
              {isVisible ? "Overlay Visible" : "Overlay Hidden"}
            </Label>
            <p className="text-xs text-muted-foreground mt-1">
              {isVisible
                ? "The floating bar is shown on screen. Use the keyboard shortcut to toggle quickly."
                : "The floating bar is hidden by default. Toggle on to show it, or use the keyboard shortcut."}
            </p>
          </div>
        </div>
        <Switch
          checked={isVisible}
          onCheckedChange={handleSwitchChange}
          title={`Toggle overlay ${isVisible ? "off" : "on"}`}
          aria-label={`Toggle overlay visibility`}
        />
      </div>
    </div>
  );
};
