import {
  MessagesSquare,
  WandSparkles,
  AudioLinesIcon,
  KeyboardIcon,
  MonitorIcon,
  PowerIcon,
  BugIcon,
  MicIcon,
  BookOpenIcon,
  PlugIcon,
  PaletteIcon,
  EyeOffIcon,
  SlidersHorizontalIcon,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";

export type MenuItem = {
  icon: React.ElementType;
  label: string;
  href: string;
  count?: number;
};

export type MenuSection = {
  label?: string;
  items: MenuItem[];
};

export const useMenuItems = () => {
  // Your work first, then settings.
  const sections: MenuSection[] = [
    {
      items: [
        { icon: MicIcon, label: "Meetings", href: "/meetings" },
        { icon: BookOpenIcon, label: "Knowledge", href: "/knowledge" },
        { icon: WandSparkles, label: "Prompts", href: "/prompts" },
        { icon: MessagesSquare, label: "Chats", href: "/chats" },
      ],
    },
    {
      label: "Settings",
      items: [
        { icon: PlugIcon, label: "AI and Speech", href: "/ai-and-speech" },
        { icon: AudioLinesIcon, label: "Audio", href: "/audio" },
        { icon: MonitorIcon, label: "Screen Capture", href: "/screen-capture" },
        {
          icon: KeyboardIcon,
          label: "Shortcuts and Cursor",
          href: "/shortcuts-and-cursor",
        },
        { icon: PaletteIcon, label: "Appearance", href: "/appearance" },
        { icon: EyeOffIcon, label: "Privacy", href: "/privacy" },
        { icon: SlidersHorizontalIcon, label: "General", href: "/general" },
      ],
    },
  ];

  const footerItems = [
    {
      icon: BugIcon,
      label: "Report a bug",
      href: "https://github.com/Agbobli5373/EchoIdeal/issues/new?template=bug-report.yml",
    },
    {
      icon: PowerIcon,
      label: "Quit EchoIdeal",
      action: async () => {
        await invoke("exit_app");
      },
    },
  ];

  return {
    sections,
    footerItems,
  };
};
