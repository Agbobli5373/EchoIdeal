import { useState, useEffect, useMemo } from "react";
import { Selection, SettingsRow } from "@/components";
import { getResponseSettings, LANGUAGES } from "@/lib";
import { updateLanguage } from "@/lib/storage/response-settings.storage";

export const LanguageSelector = () => {
  const [selectedLanguage, setSelectedLanguage] = useState<string>("english");

  useEffect(() => {
    setSelectedLanguage(getResponseSettings().language);
  }, []);

  const handleLanguageChange = (languageId: string) => {
    setSelectedLanguage(languageId);
    updateLanguage(languageId);
  };

  const languageOptions = useMemo(
    () =>
      LANGUAGES.map((lang) => ({
        label: `${lang.flag} ${lang.name}`,
        value: lang.id,
      })),
    []
  );

  return (
    <SettingsRow
      id="lang"
      title="Answer language"
      desc="Every provider answers in this language, where it can."
      keywords="response language english spanish french german translate"
      control={
        <Selection
          selected={selectedLanguage}
          onChange={handleLanguageChange}
          options={languageOptions}
          placeholder="Select a language"
          size="sm"
          className="w-52"
        />
      }
    />
  );
};
