import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SettingsRow,
} from "@/components";
import { useApp } from "@/contexts";
import { getPlatform } from "@/lib";
import { CursorType } from "@/lib/storage";
import { defineSettings } from "@/lib/settings-index";

// Registered for settings search (see lib/settings-index).
const SETTINGS = defineSettings("/shortcuts-and-cursor", {
  cursor: {
    title: "Cursor over the overlay",
    group: "Cursor",
    keywords: "pointer mouse invisible",
  },
});

export const CursorSelection = () => {
  const { customizable, setCursorType } = useApp();
  const platform = getPlatform();

  return (
    <SettingsRow
      {...SETTINGS.cursor}
      desc="Invisible hides the pointer over the overlay; Auto shows the usual pointer for text and links."

      control={
        <Select
          value={customizable.cursor.type}
          onValueChange={(value) => setCursorType(value as CursorType)}
        >
          <SelectTrigger
            size="sm"
            className="w-52"
            aria-label="Cursor over the overlay"
          >
            <SelectValue placeholder="Select a cursor type" />
          </SelectTrigger>
          <SelectContent position="popper" align="end">
            <SelectItem value="invisible" disabled={platform === "linux"}>
              Invisible
              {platform === "linux" && " (not supported on Linux)"}
            </SelectItem>
            <SelectItem value="default">Default</SelectItem>
            <SelectItem value="auto">Auto</SelectItem>
          </SelectContent>
        </Select>
      }
    />
  );
};
