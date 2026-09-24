import { useTheme } from "@/contexts";
import { SegmentedControl, SettingsRow, Slider } from "@/components";

export const Theme = () => {
  const { theme, transparency, setTheme, onSetTransparency } = useTheme();

  return (
    <>
      <SettingsRow
        id="theme"
        title="Theme"
        keywords="dark mode light appearance colour color"
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
        id="transparency"
        title="Overlay transparency"
        desc="See through the overlay during a Meeting. The dashboard stays solid so text stays readable."
        keywords="window transparency opacity see-through"
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
