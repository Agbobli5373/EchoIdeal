import { createContext, useContext, useEffect, useState } from "react";
import { isMacOS } from "@/lib/platform";

/**
 * The title of the page on screen. On macOS the title sits in the toolbar row
 * beside the traffic lights, so PageHeader publishes it here for the toolbar.
 */
const PageTitleContext = createContext<{
  title: string;
  setTitle: (title: string) => void;
}>({ title: "", setTitle: () => {} });

export const PageTitleProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [title, setTitle] = useState("");
  return (
    <PageTitleContext.Provider value={{ title, setTitle }}>
      {children}
    </PageTitleContext.Provider>
  );
};

export const usePageTitle = () => useContext(PageTitleContext).title;

/**
 * The one header every dashboard page uses: its title, a line saying what the
 * page is for, and the page's actions on the right. On Windows and Linux the
 * title is shown here; on macOS it's shown in the toolbar instead.
 */
export const PageHeader = ({
  title,
  subtitle,
  actions,
  titleEditor,
}: {
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  /** Shown in place of the title while it's being renamed. */
  titleEditor?: React.ReactNode;
}) => {
  const { setTitle } = useContext(PageTitleContext);
  const titleInToolbar = isMacOS();

  useEffect(() => {
    setTitle(title);
  }, [title]);

  return (
    <header className="flex items-start justify-between gap-4 pt-7 pb-5">
      <div className="min-w-0 flex-1">
        {titleEditor ??
          (!titleInToolbar && (
            <h1 className="page-title truncate font-semibold leading-tight text-foreground">
              {title}
            </h1>
          ))}
        {subtitle && (
          <div className="mt-0.5 text-muted-foreground">{subtitle}</div>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      )}
    </header>
  );
};
