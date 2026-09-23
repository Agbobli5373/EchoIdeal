import { PageHeader, ScrollArea } from "@/components";

export const PageLayout = ({
  children,
  title,
  subtitle,
  actions,
}: {
  children: React.ReactNode;
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}) => {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader title={title} subtitle={subtitle} actions={actions} />

      <ScrollArea className="min-h-0 flex-1 pr-6">
        <div className="flex flex-col gap-6 pb-12 pt-1 px-1">{children}</div>
      </ScrollArea>
    </div>
  );
};
