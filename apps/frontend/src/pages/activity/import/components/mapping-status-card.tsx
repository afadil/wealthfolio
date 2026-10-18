import { ReactNode } from "react";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

// Status Card Component
interface MappingStatusCardProps {
  title: string;
  icon: ReactNode;
  mappedCount: number;
  totalCount: number;
  isComplete: boolean;
  additionalText?: string;
}

export function MappingStatusCard({
  title,
  icon,
  mappedCount,
  totalCount,
  isComplete,
  additionalText,
}: MappingStatusCardProps) {
  const { t } = useTranslation();
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md border p-2",
        isComplete
          ? "border-success-subtle-border bg-success-subtle"
          : "border-destructive-subtle-border bg-destructive-subtle",
      )}
    >
      <div
        className={cn(
          "rounded-full p-1",
          isComplete
            ? "bg-success-subtle text-success-subtle-foreground"
            : "bg-destructive-subtle text-destructive-subtle-foreground",
        )}
      >
        {icon}
      </div>
      <div className="flex-1">
        <p
          className={cn(
            "text-sm font-medium",
            isComplete ? "text-success-subtle-foreground" : "text-destructive-subtle-foreground",
          )}
        >
          {title}
        </p>
        <p className="text-muted-foreground text-xs">
          {t("activity:import.mapping.mappedCount", { mapped: mappedCount, total: totalCount })}
          {additionalText && ` ${additionalText}`}
        </p>
      </div>
      {isComplete ? (
        <Icons.CheckCircle className="text-success h-4 w-4" />
      ) : (
        <Icons.AlertCircle className="text-destructive h-4 w-4" />
      )}
    </div>
  );
}
