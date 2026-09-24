import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  Button,
  SettingsRow,
} from "@/components";
import { MicIcon, RefreshCwIcon, HeadphonesIcon } from "lucide-react";
import { useState, useEffect } from "react";
import { useApp } from "@/contexts";
import { STORAGE_KEYS } from "@/config/constants";
import { safeLocalStorage } from "@/lib/storage";
import { invoke } from "@tauri-apps/api/core";
import { defineSettings } from "@/lib/settings-index";

// Registered for settings search (see lib/settings-index).
const SETTINGS = defineSettings("/audio", {
  mic: {
    title: "Microphone",
    keywords: "input mic microphone recording voice",
  },
  sysaudio: {
    title: "System audio",
    keywords: "output speakers headphones loopback interviewer",
  },
});

export const AudioSelection = () => {
  const { selectedAudioDevices, setSelectedAudioDevices } = useApp();

  const [isLoadingDevices, setIsLoadingDevices] = useState(false);
  const [showSuccess, setShowSuccess] = useState<{
    input: boolean;
    output: boolean;
  }>({
    input: false,
    output: false,
  });
  const [devices, setDevices] = useState<{
    input: { id: string; name: string; is_default: boolean }[];
    output: { id: string; name: string; is_default: boolean }[];
  }>({
    input: [],
    output: [],
  });

  // Save devices to localStorage
  const saveToStorage = (newDevices: typeof selectedAudioDevices) => {
    safeLocalStorage.setItem(
      STORAGE_KEYS.SELECTED_AUDIO_DEVICES,
      JSON.stringify(newDevices)
    );
  };

  // Load all audio devices (input and output)
  const loadAudioDevices = async () => {
    setIsLoadingDevices(true);
    try {
      const [inputDevices, outputDevices] = await Promise.all([
        invoke<{ id: string; name: string; is_default: boolean }[]>(
          "get_input_devices"
        ),
        invoke<{ id: string; name: string; is_default: boolean }[]>(
          "get_output_devices"
        ),
      ]);

      setDevices({
        input:
          inputDevices.map((input) => ({
            id: input?.id,
            name: input?.name,
            is_default: input?.is_default,
          })) || [],
        output:
          outputDevices.map((output) => ({
            id: output?.id,
            name: output?.name,
            is_default: output?.is_default,
          })) || [],
      });

      // Only update if no device is currently selected or if the selected device doesn't exist
      const currentInputExists = inputDevices.some(
        (d) => d.id === selectedAudioDevices.input.id
      );
      const currentOutputExists = outputDevices.some(
        (d) => d.id === selectedAudioDevices.output.id
      );

      if (!currentInputExists || !currentOutputExists) {
        const defaultInput = inputDevices?.find((d) => d?.is_default);
        const defaultOutput = outputDevices?.find((d) => d?.is_default);

        const newDevices = {
          input: currentInputExists
            ? selectedAudioDevices.input
            : {
                id: defaultInput?.id || inputDevices[0]?.id || "",
                name: defaultInput?.name || inputDevices[0]?.name || "",
              },
          output: currentOutputExists
            ? selectedAudioDevices.output
            : {
                id: defaultOutput?.id || outputDevices[0]?.id || "",
                name: defaultOutput?.name || outputDevices[0]?.name || "",
              },
        };

        setSelectedAudioDevices(newDevices);
        saveToStorage(newDevices);
      }
    } catch (error) {
      console.error("Error loading audio devices:", error);
    } finally {
      setIsLoadingDevices(false);
    }
  };

  useEffect(() => {
    loadAudioDevices();
  }, []);

  // Handle device selection changes
  const handleDeviceChange = (type: "input" | "output", deviceId: string) => {
    const deviceList = type === "input" ? devices.input : devices.output;
    const selectedDevice = deviceList.find((d) => d.id === deviceId);

    if (!selectedDevice) return;

    const newDevices = {
      ...selectedAudioDevices,
      [type]: { id: deviceId, name: selectedDevice.name },
    };

    setSelectedAudioDevices(newDevices);
    saveToStorage(newDevices);

    setShowSuccess((prev) => ({ ...prev, [type]: true }));
    setTimeout(() => {
      setShowSuccess((prev) => ({ ...prev, [type]: false }));
    }, 3000);
  };

  type Device = { id: string; name: string; is_default: boolean };

  const deviceSelect = (
    type: "input" | "output",
    list: Device[],
    selectedId: string,
    Icon: typeof MicIcon,
    noun: string
  ) => {
    const current = list.find((d) => d.id === selectedId);
    return (
      <>
        <Select
          value={selectedId}
          onValueChange={(value) => handleDeviceChange(type, value)}
          disabled={isLoadingDevices || list.length === 0}
        >
          <SelectTrigger size="sm" className="w-60" aria-label={noun}>
            <div className="flex min-w-0 items-center gap-2">
              <Icon className="size-4 shrink-0" />
              <span className="truncate">
                {isLoadingDevices
                  ? "Loading…"
                  : list.length === 0
                    ? `No ${noun.toLowerCase()}s found`
                    : current
                      ? `${current.name}${current.is_default ? " (Default)" : ""}`
                      : `Select a ${noun.toLowerCase()}`}
              </span>
            </div>
          </SelectTrigger>
          <SelectContent>
            {list.map((device) => (
              <SelectItem key={device.id} value={device.id}>
                <div className="flex items-center gap-2">
                  <Icon className="size-4" />
                  <span className="truncate">{device.name}</span>
                  {device.is_default && " (Default)"}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="icon"
          variant="outline"
          onClick={loadAudioDevices}
          disabled={isLoadingDevices}
          className="size-8 shrink-0"
          title={`Refresh the ${noun.toLowerCase()} list`}
          aria-label={`Refresh the ${noun.toLowerCase()} list`}
        >
          <RefreshCwIcon
            className={`size-3.5 ${isLoadingDevices ? "animate-spin" : ""}`}
          />
        </Button>
      </>
    );
  };

  const status = (type: "input" | "output", list: Device[], usual: string) => {
    if (showSuccess[type]) {
      return `Now using ${selectedAudioDevices[type].name || "this device"}.`;
    }
    if (list.length === 0 && !isLoadingDevices) {
      return "No devices found. Refresh the list, or check your system's sound settings.";
    }
    return usual;
  };

  return (
    <>
      <SettingsRow
        {...SETTINGS.mic}
        desc={status(
          "input",
          devices.input,
          "Your Spoken Answers, when “Remember my answers” is on, and voice input."
        )}

        control={deviceSelect(
          "input",
          devices.input,
          selectedAudioDevices.input.id,
          MicIcon,
          "Microphone"
        )}
      />
      <SettingsRow
        {...SETTINGS.sysaudio}
        desc={status(
          "output",
          devices.output,
          "The Interviewer, from your speakers or headphones."
        )}

        control={deviceSelect(
          "output",
          devices.output,
          selectedAudioDevices.output.id,
          HeadphonesIcon,
          "Output device"
        )}
      />
    </>
  );
};
