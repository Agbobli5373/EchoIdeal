import { useMemo } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components";
import { useCopilotProfile } from "@/contexts/copilot-profile.context";

export const CopilotProfilePicker = () => {
  const { profiles, activeProfileId, setActiveProfileId, loading } =
    useCopilotProfile();

  const selectValue = useMemo(() => {
    if (activeProfileId && profiles.some((p) => p.id === activeProfileId)) {
      return activeProfileId;
    }
    return "_none_";
  }, [activeProfileId, profiles]);

  if (loading && profiles.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border/50 bg-card/40 p-3 max-w-md">
      <span className="text-xs font-medium text-muted-foreground">
        Active copilot profile
      </span>
      <p className="text-[11px] text-muted-foreground">
        Used by the overlay, meetings, and fusion assist for extra system
        instructions and knowledge defaults.
      </p>
      <Select
        value={selectValue}
        onValueChange={(v) => setActiveProfileId(v === "_none_" ? null : v)}
      >
        <SelectTrigger className="h-9 text-xs">
          <SelectValue placeholder="Choose profile" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="_none_">No profile</SelectItem>
          {profiles.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};
