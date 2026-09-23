import React from "react";
import { Streamdown } from "streamdown";
import "katex/dist/katex.min.css";
import { openUrl } from "@tauri-apps/plugin-opener";
import { CircleAlertIcon } from "lucide-react";
import { splitUngrounded } from "@/lib/knowledge/grounding";

interface MarkdownRendererProps {
  children: string;
  isStreaming?: boolean;
}

export function Markdown({
  children,
  isStreaming = false,
}: MarkdownRendererProps) {
  const { text, ungrounded } = splitUngrounded(children);
  return (
    <>
      {ungrounded ? <UngroundedBadge /> : null}
      <Streamdown
        isAnimating={isStreaming}
        shikiTheme={["github-light", "github-dark"]}
        components={COMPONENTS as any}
        controls={{
          table: true,
          code: true,
          mermaid: {
            download: true,
            copy: true,
            fullscreen: false,
            panZoom: false,
          },
        }}
      >
        {text}
      </Streamdown>
    </>
  );
}

function UngroundedBadge() {
  return (
    <span
      className="mb-2 inline-flex w-fit items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300 select-none"
      title="This answer needs facts about you that aren't in your Active Knowledge. Check it before saying it."
    >
      <CircleAlertIcon className="size-3" />
      Not from your knowledge
    </span>
  );
}

const COMPONENTS = {
  a: ({ children, href, ...props }: any) => {
    const handleClick = async (e: React.MouseEvent) => {
      e.preventDefault();
      if (href) {
        try {
          await openUrl(href);
        } catch (error) {
          console.error("Failed to open URL:", error);
        }
      }
    };

    return (
      <a
        href={href}
        className="text-gray-600 underline underline-offset-2 hover:text-gray-800 dark:text-gray-300 dark:hover:text-gray-100 cursor-pointer"
        onClick={handleClick}
        {...props}
      >
        {children}
      </a>
    );
  },
};
