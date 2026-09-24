import { useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { MapPinIcon } from "lucide-react";
import { Button, SettingsGroup, SettingsRow } from "@/components";
import { PageLayout } from "@/layouts";
import { About as AppRows } from "../settings/components";
import { defineSettings } from "@/lib/settings-index";

// From the developer's GitHub profile (github.com/Agbobli5373).
const DEVELOPER = {
  name: "Isaac Agbobli",
  role: "Software Engineer",
  location: "Anloga, Ghana",
  avatar: "https://avatars.githubusercontent.com/u/62448009?v=4",
  bio: "I am a Software Engineer passionate about building scalable backends and automating reliable delivery pipelines. With a strong foundation in Java, TypeScript, and Microservices, I bridge the gap between complex architectural design and practical, bug-free implementation.",
  motto:
    "Creating efficient, well-tested, and scalable solutions through code and automation.",
  skills: [
    "Java",
    "Spring Boot",
    "TypeScript",
    "NestJS",
    "React",
    "Test automation",
  ],
};

const CONTACT = {
  whatsapp: { display: "+233 54 021 8724", url: "https://wa.me/233540218724" },
  email: "agbobliisaac@gmail.com",
  github: "https://github.com/Agbobli5373",
  linkedin: "https://www.linkedin.com/in/isaac-agbobli",
};

// EchoIdeal's first year; the copyright runs from here to the current year.
const FIRST_YEAR = 2026;

// Registered for settings search (see lib/settings-index).
const SETTINGS = defineSettings("/about", {
  whatsapp: {
    title: "WhatsApp",
    group: "Contact",
    keywords: "contact developer phone message support chat",
  },
  email: {
    title: "Email",
    group: "Contact",
    keywords: "contact developer mail support",
  },
  github: {
    title: "GitHub",
    group: "Contact",
    keywords: "developer code source repository profile",
  },
  linkedin: {
    title: "LinkedIn",
    group: "Contact",
    keywords: "developer profile",
  },
  copyright: {
    title: "Copyright",
    group: "Copyright and licence",
    keywords: "copyright owner author developer",
  },
  pluely: {
    title: "Based on Pluely",
    group: "Copyright and licence",
    keywords: "credits original author open source",
  },
  licence: {
    title: "GNU General Public License v3.0",
    group: "Copyright and licence",
    keywords: "license licence gpl open source terms",
  },
});

/** The developer's photo, or their initials when it can't load (for example offline). */
const Avatar = () => {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className="flex size-16 shrink-0 items-center justify-center rounded-full bg-primary text-xl font-semibold text-primary-foreground">
        IA
      </div>
    );
  }
  return (
    <img
      src={DEVELOPER.avatar}
      alt={DEVELOPER.name}
      className="size-16 shrink-0 rounded-full object-cover"
      onError={() => setFailed(true)}
    />
  );
};

const About = () => {
  const year = new Date().getFullYear();
  const years = year > FIRST_YEAR ? `${FIRST_YEAR}–${year}` : `${FIRST_YEAR}`;

  return (
    <PageLayout
      title="About"
      subtitle="Who makes EchoIdeal, and how to get in touch."
    >
      <SettingsGroup title="EchoIdeal">
        <AppRows />
      </SettingsGroup>

      <SettingsGroup title="Developer">
        <div className="flex items-start gap-4 px-4 py-4">
          <Avatar />
          <div className="min-w-0 flex-1 space-y-2">
            <div>
              <div className="text-base font-semibold text-foreground">
                {DEVELOPER.name}
              </div>
              <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                <span>{DEVELOPER.role}</span>
                <span aria-hidden>·</span>
                <span className="inline-flex items-center gap-1">
                  <MapPinIcon className="size-3" />
                  {DEVELOPER.location}
                </span>
              </div>
            </div>
            <p className="text-sm leading-relaxed text-foreground">
              {DEVELOPER.bio}
            </p>
            <p className="text-xs italic text-muted-foreground">
              “{DEVELOPER.motto}”
            </p>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {DEVELOPER.skills.map((skill) => (
                <span
                  key={skill}
                  className="rounded-full bg-accent px-2 py-0.5 text-xs text-muted-foreground"
                >
                  {skill}
                </span>
              ))}
            </div>
          </div>
        </div>
      </SettingsGroup>

      <SettingsGroup title="Contact">
        <SettingsRow
          {...SETTINGS.whatsapp}
          desc={CONTACT.whatsapp.display}
          control={
            <Button
              size="sm"
              variant="outline"
              onClick={() => openUrl(CONTACT.whatsapp.url).catch(console.error)}
            >
              Message
            </Button>
          }
        />
        <SettingsRow
          {...SETTINGS.email}
          desc={CONTACT.email}
          to={`mailto:${CONTACT.email}?subject=EchoIdeal`}
        />
        <SettingsRow
          {...SETTINGS.github}
          desc="github.com/Agbobli5373"
          to={CONTACT.github}
        />
        <SettingsRow
          {...SETTINGS.linkedin}
          desc="linkedin.com/in/isaac-agbobli"
          to={CONTACT.linkedin}
        />
      </SettingsGroup>

      <SettingsGroup title="Copyright and licence">
        <SettingsRow
          {...SETTINGS.copyright}
          desc={`© ${years} ${DEVELOPER.name}. EchoIdeal is developed and maintained by ${DEVELOPER.name}.`}
        />
        <SettingsRow
          {...SETTINGS.pluely}
          desc="EchoIdeal builds on Pluely by Srikanth Nani, released under the GPL-3.0."
          to="https://github.com/iamsrikanthnani/pluely"
        />
        <SettingsRow
          {...SETTINGS.licence}
          desc="EchoIdeal is free software: you can share and change it under the terms of the GPL-3.0."
          to="https://www.gnu.org/licenses/gpl-3.0.html"
        />
      </SettingsGroup>
    </PageLayout>
  );
};

export default About;
