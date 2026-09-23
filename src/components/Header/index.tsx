import { Label } from "@/components";
import { cn } from "@/lib/utils";

interface HeaderProps {
  title: string;
  description: string;
  isMainTitle?: boolean;
  titleClassName?: string;
  descriptionClassName?: string;
  rightSlot?: React.ReactNode | null;
  showBorder?: boolean;
  className?: string;
}

export const Header = ({
  title,
  description,
  isMainTitle = false,
  titleClassName,
  descriptionClassName,
  rightSlot = null,
  showBorder = false,
  className,
}: HeaderProps) => {
  return (
    <div
      className={cn(
        `flex ${
          rightSlot ? "flex-row justify-between items-center" : "flex-col"
        } ${
          isMainTitle && (showBorder || !rightSlot)
            ? "border-b border-input/50 pb-2"
            : ""
        }`,
        className
      )}
    >
      <div className="flex items-center gap-2">
        <div className="flex flex-col">
          <Label
            className={`${cn(
              "font-semibold line-clamp-1",
              isMainTitle
                ? "text-md lg:text-lg"
                : "text-xs lg:text-sm transition-all duration-300"
            )} ${titleClassName}`}
          >
            {title}
          </Label>
          <p
            className={cn(
              `select-none text-muted-foreground leading-relaxed ${
                isMainTitle
                  ? "text-xs lg:text-sm"
                  : "text-[10px] lg:text-xs transition-all duration-300"
              } ${descriptionClassName}`
            )}
          >
            {description}
          </p>
        </div>
      </div>
      {rightSlot}
    </div>
  );
};
