import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * One rounded group of settings rows. `more` adds a collapsed disclosure at
 * the foot of the group for options most people never need.
 */
export const SettingsGroup = ({
  title,
  meta,
  more,
  children,
}: {
  title?: string;
  meta?: React.ReactNode;
  more?: {
    /** Anchor for the disclosure itself. */
    id: string;
    label: string;
    children: React.ReactNode;
  };
  children?: React.ReactNode;
}) => (
  <section className="settings-group">
    {(title || meta) && (
      <div className="flex items-baseline justify-between gap-3 px-1 pb-2">
        {title && (
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        )}
        {meta && <span className="text-xs text-muted-foreground">{meta}</span>}
      </div>
    )}
    <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
      {children}
      {more && (
        <details id={more.id} className="group/more">
          <summary className="settings-row flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 text-foreground hover:bg-accent/50 [&::-webkit-details-marker]:hidden">
            <span>{more.label}</span>
            <ChevronDownIcon className="size-4 text-muted-foreground transition-transform group-open/more:rotate-180" />
          </summary>
          <div className="divide-y divide-border border-t border-border">
            {more.children}
          </div>
        </details>
      )}
    </div>
  </section>
);

/**
 * One setting: what it is, a line on what it does, and its control. `id` is
 * the row's anchor (e.g. /privacy#visible). `to` makes the whole row a link
 * to a page or a web address; `onSelect` makes it an action. `stacked` puts
 * wide content (`children`) under the title instead of beside it.
 */
export const SettingsRow = ({
  id,
  title,
  desc,
  control,
  keywords,
  to,
  onSelect,
  stacked = false,
  children,
}: {
  id: string;
  title: React.ReactNode;
  desc?: React.ReactNode;
  control?: React.ReactNode;
  /** Extra words people might search for; used by settings search. */
  keywords?: string;
  to?: string;
  onSelect?: () => void;
  stacked?: boolean;
  children?: React.ReactNode;
}) => {
  const navigate = useNavigate();

  const text = (
    <div className="min-w-0 flex-1">
      <div className="text-foreground">{title}</div>
      {desc && (
        <div className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
          {desc}
        </div>
      )}
    </div>
  );

  if (to || onSelect) {
    const select = () => {
      if (onSelect) return onSelect();
      if (!to) return;
      if (/^https?:|^mailto:/.test(to)) openUrl(to).catch(console.error);
      else navigate(to);
    };
    return (
      <button
        type="button"
        id={id}
        data-keywords={keywords}
        onClick={select}
        className="settings-row flex w-full items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-accent/50"
      >
        {text}
        {control}
        <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
      </button>
    );
  }

  return (
    <div
      id={id}
      data-keywords={keywords}
      className={cn("settings-row px-4 py-3", !stacked && "flex items-center gap-4")}
    >
      {stacked ? (
        <>
          <div className="flex items-center gap-4">
            {text}
            {control && <div className="shrink-0">{control}</div>}
          </div>
          {children && <div className="mt-3">{children}</div>}
        </>
      ) : (
        <>
          {text}
          {control && (
            <div className="flex shrink-0 items-center gap-2">{control}</div>
          )}
        </>
      )}
    </div>
  );
};

/** A row of mutually exclusive options, e.g. Theme: System · Light · Dark. */
export const SegmentedControl = <T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
}) => (
  <div
    role="radiogroup"
    aria-label={label}
    className="inline-flex rounded-md border border-input bg-card p-0.5"
  >
    {options.map((option) => {
      const selected = option.value === value;
      return (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={selected}
          onClick={() => onChange(option.value)}
          className={cn(
            "h-7 rounded-sm px-3 text-sm transition-colors",
            selected
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {option.label}
        </button>
      );
    })}
  </div>
);

/** A shortcut shown as key caps, e.g. Ctrl · Shift · M. */
export const Keys = ({ keys }: { keys: string[] }) => (
  <span className="inline-flex items-center gap-1">
    {keys.map((key, index) => (
      <kbd
        key={`${key}-${index}`}
        className="min-w-6 rounded border border-input border-b-2 bg-card px-1.5 py-0.5 text-center font-mono text-xs text-foreground"
      >
        {key}
      </kbd>
    ))}
  </span>
);

/**
 * Opening a row's anchor (e.g. /ai-and-speech#stt-provider) scrolls to the
 * row and briefly highlights it, opening the disclosure it sits in first.
 */
export const useSettingsAnchor = () => {
  const { hash, pathname } = useLocation();

  useEffect(() => {
    const id = decodeURIComponent(hash.replace(/^#/, ""));
    if (!id) return;

    // Let the page render its rows first.
    const timer = window.setTimeout(() => {
      const target = document.getElementById(id);
      if (!target) return;

      const disclosure =
        target instanceof HTMLDetailsElement ? target : target.closest("details");
      if (disclosure && !disclosure.open) disclosure.open = true;

      target.scrollIntoView({ block: "center", behavior: "smooth" });
      target.classList.remove("settings-row-flash");
      // Restart the animation if the same anchor is opened twice.
      void target.offsetWidth;
      target.classList.add("settings-row-flash");
      window.setTimeout(
        () => target.classList.remove("settings-row-flash"),
        1800
      );
    }, 50);

    return () => window.clearTimeout(timer);
  }, [hash, pathname]);
};
