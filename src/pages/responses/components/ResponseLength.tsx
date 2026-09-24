import { useState, useEffect } from "react";
import { SegmentedControl, SettingsRow } from "@/components";
import { getResponseSettings, RESPONSE_LENGTHS } from "@/lib";
import { updateResponseLength } from "@/lib/storage/response-settings.storage";

export const ResponseLength = () => {
  const [selectedLength, setSelectedLength] = useState<string>("auto");

  useEffect(() => {
    setSelectedLength(getResponseSettings().responseLength);
  }, []);

  const handleLengthChange = (lengthId: string) => {
    setSelectedLength(lengthId);
    updateResponseLength(lengthId);
  };

  return (
    <SettingsRow
      id="len"
      title="Answer length"
      desc={
        RESPONSE_LENGTHS.find((length) => length.id === selectedLength)
          ?.description ?? "How long each Suggested Answer is."
      }
      keywords="response length short medium auto detail"
      control={
        <SegmentedControl
          label="Answer length"
          value={selectedLength}
          onChange={handleLengthChange}
          options={RESPONSE_LENGTHS.map((length) => ({
            value: length.id,
            label: length.title,
          }))}
        />
      }
    />
  );
};
