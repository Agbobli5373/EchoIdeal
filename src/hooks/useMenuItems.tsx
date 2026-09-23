import {
  Settings,
  Code,
  MessagesSquare,
  WandSparkles,
  AudioLinesIcon,
  SquareSlashIcon,
  MonitorIcon,
  HomeIcon,
  PowerIcon,
  MailIcon,
  CoffeeIcon,
  GlobeIcon,
  BugIcon,
  MessageSquareTextIcon,
  MicIcon,
  BookOpenIcon,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useApp } from "@/contexts";
import { XIcon, GithubIcon } from "@/components";

export const useMenuItems = () => {
  const { hasActiveLicense } = useApp();

  const menu: {
    icon: React.ElementType;
    label: string;
    href: string;
    count?: number;
    premiumOnly?: boolean;
  }[] = [
    {
      icon: HomeIcon,
      label: "Dashboard",
      href: "/dashboard",
    },
    {
      icon: MessagesSquare,
      label: "Chats",
      href: "/chats",
    },
    {
      icon: MicIcon,
      label: "Meetings",
      href: "/meetings",
      premiumOnly: true,
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
      premiumOnly: true,
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
    ...(hasActiveLicense
      ? [
          {
            icon: MailIcon,
            label: "Contact Support",
            href: "mailto:support@echoideal.com",
          },
        ]
      : []),
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

  const footerLinks: {
    title: string;
    icon: React.ElementType;
    link: string;
  }[] = [
    {
      title: "Website",
      icon: GlobeIcon,
      link: "https://echoideal.com",
    },
    {
      title: "Github",
      icon: GithubIcon,
      link: "https://github.com/Agbobli5373/EchoIdeal",
    },
    {
      title: "Buy Me a Coffee",
      icon: CoffeeIcon,
      link: "https://www.buymeacoffee.com/agbobli5373",
    },
    {
      title: "Follow on X",
      icon: XIcon,
      link: "https://x.com/IsaacAgbobli",
    },
  ];

  return {
    menu,
    footerItems,
    footerLinks,
  };
};
