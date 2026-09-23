import {
  Settings,
  Code,
  MessagesSquare,
  WandSparkles,
  AudioLinesIcon,
  SquareSlashIcon,
  MonitorIcon,
  PowerIcon,
  BugIcon,
  MessageSquareTextIcon,
  MicIcon,
  BookOpenIcon,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";

export const useMenuItems = () => {
  const menu: {
    icon: React.ElementType;
    label: string;
    href: string;
    count?: number;
  }[] = [
    {
      icon: MessagesSquare,
      label: "Chats",
      href: "/chats",
    },
    {
      icon: MicIcon,
      label: "Meetings",
      href: "/meetings",
    },
    {
      icon: WandSparkles,
      label: "System prompts",
      href: "/system-prompts",
    },
    {
      icon: BookOpenIcon,
      label: "Knowledge",
      href: "/knowledge",
    },
    {
      icon: MessageSquareTextIcon,
      label: "Responses",
      href: "/responses",
    },
    {
      icon: MonitorIcon,
      label: "Screenshot",
      href: "/screenshot",
    },
    {
      icon: AudioLinesIcon,
      label: "Audio",
      href: "/audio",
    },
    {
      icon: SquareSlashIcon,
      label: "Cursor & Shortcuts",
      href: "/shortcuts",
    },
    {
      icon: Settings,
      label: "App Settings",
      href: "/settings",
    },
    {
      icon: Code,
      label: "Dev space",
      href: "/dev-space",
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
      label: "Quit echoideal",
      action: async () => {
        await invoke("exit_app");
      },
    },
  ];

  return {
    menu,
    footerItems,
  };
};
