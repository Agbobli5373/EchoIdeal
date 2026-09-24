import {
  MessagesSquare,
  WandSparkles,
  AudioLinesIcon,
  KeyboardIcon,
  MonitorIcon,
  MicIcon,
  BookOpenIcon,
  PlugIcon,
  PaletteIcon,
  EyeOffIcon,
  SlidersHorizontalIcon,
} from "lucide-react";

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

  return {
    sections,
  };
};
