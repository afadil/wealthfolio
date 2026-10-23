import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { SCOPES, scopeDescription, scopeLabel, type ScopeKey } from "../scopes";

interface ScopeSelectorProps {
  selectedScopes: ScopeKey[];
  onToggle: (scope: ScopeKey) => void;
  disabled?: boolean;
}

export function ScopeSelector({ selectedScopes, onToggle, disabled }: ScopeSelectorProps) {
  const { t } = useTranslation();
  const renderScope = (scope: (typeof SCOPES)[number]) => {
    const checked = selectedScopes.includes(scope.key);
    const label = scopeLabel(t, scope.key);
    const description = scopeDescription(t, scope.key);
    const lockedByMarketData =
      scope.key === "holdings:read" && selectedScopes.includes("market-data:write");
    const locked =
      lockedByMarketData ||
      (scope.key === "activities:draft" && selectedScopes.includes("activities:write")) ||
      (scope.key === "classification:suggest" && selectedScopes.includes("classification:write"));
    const lockedTitle = lockedByMarketData
      ? t("settings:agentAccess.scope_locked_market_data_title")
      : t("settings:agentAccess.scope_locked_title");
    return (
      <button
        key={scope.key}
        type="button"
        role="checkbox"
        aria-checked={checked}
        aria-label={t("settings:agentAccess.dialog_scope_aria", { label, description })}
        disabled={disabled || locked}
        title={locked ? lockedTitle : description}
        onClick={() => onToggle(scope.key)}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-start text-sm transition-colors",
          "focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-2",
          checked
            ? "border-success-subtle-border bg-success-subtle text-success-subtle-foreground"
            : "border-border hover:border-muted-foreground/30 hover:bg-muted/40",
          locked && "cursor-not-allowed opacity-80",
        )}
      >
        <span className="truncate font-medium">{label}</span>
        <span
          className={cn(
            "grid h-4 w-4 shrink-0 place-items-center transition-colors",
            checked
              ? "bg-success rounded-[0.3125rem] text-white"
              : "border-muted-foreground/30 rounded-full border-2",
          )}
          aria-hidden
        >
          {checked && <Icons.Check className="h-2.5 w-2.5" strokeWidth={3} />}
        </span>
      </button>
    );
  };

  return (
    <>
      {(["read", "write"] as const).map((group) => (
        <div key={group} className="space-y-2">
          <p className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
            {t(
              group === "read"
                ? "settings:agentAccess.dialog_read_access"
                : "settings:agentAccess.dialog_write_access",
            )}
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {SCOPES.filter((scope) => scope.group === group).map(renderScope)}
          </div>
        </div>
      ))}
    </>
  );
}
