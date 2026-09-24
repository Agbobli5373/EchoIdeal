import { useState } from "react";
import { SearchIcon, ZapIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { isMacOS } from "@/lib/platform";
import { useLocation, useNavigate } from "react-router-dom";
import { useMenuItems, useVersion } from "@/hooks";
import type { MenuItem } from "@/hooks/useMenuItems";

export const Sidebar = () => {
  const { version, isLoading } = useVersion();
  const { sections } = useMenuItems();
  const [query, setQuery] = useState("");

  const navigate = useNavigate();
  const activeRoute = useLocation().pathname;
  const mac = isMacOS();
  // On Windows and Linux the title bar carries the app name instead.
  const showBrand = mac;

  // Until settings search arrives, the box narrows the list to matching pages.
  const q = query.trim().toLowerCase();
  const visibleSections = sections
    .map((section) => ({
      ...section,
      items: q
        ? section.items.filter((item) => item.label.toLowerCase().includes(q))
        : section.items,
    }))
    .filter((section) => section.items.length > 0);

  const isCurrent = (item: MenuItem) =>
    activeRoute === item.href || activeRoute.startsWith(`${item.href}/`);

  return (
    <aside
      className={cn(
        "flex w-60 shrink-0 flex-col select-none",
        showBrand && "pt-[52px] border-r border-sidebar-border/60"
      )}
    >
      {/* Brand */}
      {showBrand && (
        <div
          onClick={() => navigate("/chats")}
          className="flex h-12 items-center px-5 gap-2.5 cursor-pointer"
        >
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary">
            <ZapIcon className="size-4 text-primary-foreground" />
          </div>
          <div className="flex flex-col">
            <h1 className="text-sm font-bold tracking-tight text-foreground">
              EchoIdeal
            </h1>
            <span className="text-[9px] text-muted-foreground font-medium -mt-0.5 block">
              {isLoading ? "Loading..." : `v${version}`}
            </span>
          </div>
        </div>
      )}

      {/* Search */}
      <div className={cn("relative px-3", mac ? "pt-2 pb-1" : "pt-1 pb-2")}>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && setQuery("")}
          placeholder="Find a setting"
          aria-label="Find a setting"
          className={cn(
            "w-full rounded-md pl-2.5 pr-8 text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/50",
            mac
              ? "h-7 border border-transparent bg-sidebar-accent"
              : "h-8 border border-input bg-card"
          )}
        />
        <SearchIcon className="pointer-events-none absolute right-5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        {visibleSections.map((section, sectionIndex) => (
          <div key={section.label ?? `section-${sectionIndex}`}>
            {section.label && (
              <div
                className={cn(
                  "px-3 pt-3.5 pb-1 text-xs text-muted-foreground",
                  mac && "font-semibold"
                )}
              >
                {section.label}
              </div>
            )}
            {section.items.map((item) => {
              const current = isCurrent(item);
              return (
                <button
                  type="button"
                  key={item.href}
                  onClick={() => navigate(item.href)}
                  aria-current={current ? "page" : undefined}
                  className={cn(
                    "relative mb-0.5 flex w-full items-center gap-3 px-3 text-left text-foreground transition-colors",
                    mac ? "h-7 rounded-md" : "h-9 rounded",
                    current
                      ? mac
                        ? "bg-primary text-primary-foreground"
                        : "bg-sidebar-accent before:absolute before:left-0 before:top-1/2 before:h-4 before:w-[3px] before:-translate-y-1/2 before:rounded-full before:bg-primary"
                      : "hover:bg-sidebar-accent/70"
                  )}
                >
                  <item.icon
                    className={cn(
                      "shrink-0",
                      mac ? "size-4" : "size-[18px]",
                      mac
                        ? current
                          ? "text-primary-foreground"
                          : "text-primary"
                        : "text-muted-foreground"
                    )}
                  />
                  <span className="truncate">{item.label}</span>
                  {item.count ? (
                    <span className="ml-auto text-xs text-muted-foreground">
                      {item.count}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        ))}
        {visibleSections.length === 0 && (
          <p className="px-3 py-2 text-xs text-muted-foreground">
            No pages match “{query.trim()}”.
          </p>
        )}
      </nav>
    </aside>
  );
};
