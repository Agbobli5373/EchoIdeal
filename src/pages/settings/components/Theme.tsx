import { useTheme } from "@/contexts";
import { SegmentedControl, SettingsRow, Slider } from "@/components";
import { defineSettings } from "@/lib/settings-index";

// Registered for settings search (see lib/settings-index).
const SETTINGS = defineSettings("/appearance", {
  theme: {
    title: "Theme",
    keywords: "dark mode light appearance colour color",
  },
  transparency: {
    title: "Overlay transparency",
    keywords: "window transparency opacity see-through",
  },
});

export const Theme = () => {
  const { theme, transparency, setTheme, onSetTransparency } = useTheme();

  return (
    <>
      <SettingsRow
        {...SETTINGS.theme}

        control={
          <SegmentedControl
            label="Theme"
            value={theme}
            onChange={setTheme}
            options={[
              { value: "system", label: "System" },
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
            ]}
          />
        }
      />
      <SettingsRow
        {...SETTINGS.transparency}
        desc="See through the overlay during a Meeting. The dashboard stays solid so text stays readable."

        control={
          <div className="flex w-52 items-center gap-3">
            <Slider
              value={[transparency]}
              onValueChange={(value: number[]) => onSetTransparency(value[0])}
              min={0}
              max={100}
              step={1}
              className="flex-1"
              aria-label="Overlay transparency"
            />
            <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">
              {transparency}%
            </span>
          </div>
        }
      />
    </>
  );
};
