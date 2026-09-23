import React from "react";
import { Streamdown } from "streamdown";
import "katex/dist/katex.min.css";
import { openUrl } from "@tauri-apps/plugin-opener";
import { CircleAlertIcon, EyeOffIcon } from "lucide-react";
import { parseAnswer } from "@/lib/meeting/answer";

interface MarkdownRendererProps {
  children: string;
  isStreaming?: boolean;
}

export function Markdown({
  children,
  isStreaming = false,
}: MarkdownRendererProps) {
  const { text, ungrounded, discrepancies } = parseAnswer(children);
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
      {discrepancies.map((note, index) => (
        <DiscrepancyNote key={index} note={note} />
      ))}
    </>
  );
}

function DiscrepancyNote({ note }: { note: string }) {
  return (
    <p
      className="not-prose mt-2 flex w-fit items-start gap-1.5 rounded-md border border-sky-500/30 bg-sky-500/10 px-2 py-1 text-[11px] text-sky-800 dark:text-sky-200 select-none"
      title="Only you see this. Suggested Answers stay consistent with what you said."
      role="note"
    >
      <EyeOffIcon className="mt-0.5 size-3 shrink-0" />
      <span>{note}</span>
    </p>
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
