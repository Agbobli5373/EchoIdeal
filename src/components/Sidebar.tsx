import { ZapIcon, LockIcon } from "lucide-react";
import { Button } from "@/components";
import { cn } from "@/lib/utils";
import { useLocation, useNavigate } from "react-router-dom";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useMenuItems, useVersion } from "@/hooks";
import { useApp } from "@/contexts";

export const Sidebar = () => {
  const { version, isLoading } = useVersion();
  const { menu, footerLinks, footerItems } = useMenuItems();
  const { hasActiveLicense } = useApp();

  const navigate = useNavigate();
  const activeRoute = useLocation().pathname;
  return (
    <aside className="flex w-60 flex-col select-none border-r border-sidebar-border/60">
      {/* Brand */}
      <div
        onClick={() => navigate("/dashboard")}
        className="flex h-16 items-center px-5 pt-10 gap-2.5 cursor-pointer"
      >
        <div className="flex size-8 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/70 shadow-sm">
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

      {/* Navigation */}
      <nav className="flex-1 space-y-0.5 px-3 py-6">
        {menu.map((item, index) => {
          const isPremiumLocked = item.premiumOnly && !hasActiveLicense;
          return (
            <button
              onClick={() => !isPremiumLocked && navigate(item.href)}
              key={`${item.label}-${index}`}
              className={cn(
                "flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-[13px] transition-all duration-200 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                isPremiumLocked
                  ? "text-sidebar-foreground/30 cursor-not-allowed"
                  : activeRoute.includes(item.href)
                    ? "font-semibold bg-primary/10 text-primary border border-primary/15"
                    : "text-sidebar-foreground/60 border border-transparent"
              )}
            >
              <div className="flex items-center gap-2.5">
                <item.icon className={cn(
                  "size-4 transition-all duration-200",
                  activeRoute.includes(item.href) ? "text-primary" : ""
                )} />
                {item.label}
              </div>
              {item.count ? (
                <span className="flex size-5 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">
                  {item.count}
                </span>
              ) : isPremiumLocked ? (
                <LockIcon className="size-3.5 text-muted-foreground/50" />
              ) : null}
            </button>
          );
        })}
      </nav>

      <div className="flex flex-col space-y-0.5 px-3 pb-4">
        <div className="flex flex-row justify-evenly items-center gap-1.5 mb-3 px-1">
          {footerLinks.map((item, index) => (
            <Button
              key={`${item.title}-${index}`}
              title={item.title}
              size="sm"
              variant="ghost"
              className="text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors duration-200"
              onClick={() => openUrl(item.link)}
            >
              <item.icon className="size-3.5" />
            </Button>
          ))}
        </div>

        {footerItems.map((item, index) => (
          <a
            href={item.href}
            onClick={item.action}
            target="_blank"
            rel="noopener noreferrer"
            key={`${item.label}-${index}`}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] text-sidebar-foreground/50 transition-all duration-200 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            )}
          >
            <item.icon className="size-3.5" />
            {item.label}
          </a>
        ))}
      </div>
    </aside>
  );
};
