import { useMemo } from "react";
import curl2Json from "@bany/curl-to-json";
import { TrashIcon } from "lucide-react";
import { Button, Input, Selection, SettingsRow } from "@/components";
import { TYPE_PROVIDER } from "@/types";

// "api_version" → "Api version"
const sentenceCase = (key: string) => {
  const words = key.replace(/_/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1).toLowerCase();
};

type SelectedProvider = {
  provider: string;
  variables: Record<string, string>;
};

/**
 * The rows for choosing an AI or speech provider: the provider itself, any
 * values its request needs (such as the model), and its API key. Values are
 * saved as they're typed.
 */
export const ProviderRows = ({
  idPrefix,
  providerDesc,
  providers,
  selected,
  onSelect,
  variables,
}: {
  /** "ai" or "stt": rows are anchored as ai-provider, ai-key, stt-provider… */
  idPrefix: string;
  providerDesc: string;
  providers: TYPE_PROVIDER[];
  selected: SelectedProvider;
  onSelect: (selected: SelectedProvider) => void;
  variables: { key: string; value: string }[];
}) => {
  const current = providers.find((p) => p?.id === selected?.provider);
  const request = useMemo(
    () => (current?.curl ? curl2Json(current.curl) : null),
    [current?.curl]
  );
  const providerName = current?.isCustom
    ? "your custom provider"
    : selected?.provider;

  const apiKeyVariable = variables.find((v) => v?.key === "api_key");
  const otherVariables = variables.filter((v) => v?.key !== "api_key");

  const valueOf = (key: string) => selected?.variables?.[key] || "";
  const setValue = (key: string, value: string) => {
    if (!selected) return;
    onSelect({
      ...selected,
      variables: { ...selected.variables, [key]: value },
    });
  };

  return (
    <>
      <SettingsRow
        id={`${idPrefix}-provider`}
        title="Provider"
        desc={
          <>
            {providerDesc}
            {request && (
              <span className="mt-0.5 block truncate font-mono text-[11px]">
                {request.method || "POST"} {request.url || "Invalid endpoint"}
              </span>
            )}
          </>
        }
        control={
          <Selection
            selected={selected?.provider}
            options={providers.map((provider) => {
              const json = curl2Json(provider?.curl);
              return {
                label: provider?.isCustom
                  ? json?.url || "Custom Provider"
                  : provider?.id || "Custom Provider",
                value: provider?.id || "Custom Provider",
                isCustom: provider?.isCustom,
              };
            })}
            placeholder="Choose a provider"
            onChange={(value) => onSelect({ provider: value, variables: {} })}
            size="sm"
            className="w-60"
          />
        }
      />

      {otherVariables.map((variable) => (
        <SettingsRow
          key={variable.key}
          id={`${idPrefix}-${variable.key.replace(/_/g, "-")}`}
          title={sentenceCase(variable.key)}
          desc={`The ${variable.key.replace(/_/g, " ")} to use with ${providerName}.`}
          control={
            <Input
              className="h-8 w-60"
              placeholder={`Enter ${variable.key.replace(/_/g, " ")}`}
              aria-label={variable.value || variable.key}
              value={valueOf(variable.key)}
              onChange={(e) => setValue(variable.key, e.target.value)}
            />
          }
        />
      ))}

      {apiKeyVariable && (
        <SettingsRow
          id={`${idPrefix}-key`}
          title="API key"
          desc={`Your ${providerName} key. It’s stored on this device and never shared.`}
          control={
            <>
              <Input
                type="password"
                className="h-8 w-60"
                placeholder="Paste your API key"
                aria-label="API key"
                value={valueOf(apiKeyVariable.key)}
                onChange={(e) => setValue(apiKeyVariable.key, e.target.value)}
              />
              {valueOf(apiKeyVariable.key).trim() && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8 text-muted-foreground hover:text-destructive"
                  onClick={() => setValue(apiKeyVariable.key, "")}
                  title="Remove API key"
                  aria-label="Remove API key"
                >
                  <TrashIcon className="size-3.5" />
                </Button>
              )}
            </>
          }
        />
      )}
    </>
  );
};
