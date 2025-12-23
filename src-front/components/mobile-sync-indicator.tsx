import { usePortfolioSyncOptional } from "@/context/portfolio-sync-context";
import { cn } from "@/lib/utils";

export function MobileSyncIndicator() {
  const syncContext = usePortfolioSyncOptional();

  if (!syncContext || syncContext.status === "idle") {
    return null;
  }

  return (
    <div className="fixed inset-x-0 top-0 z-[100]">
      {/* Animated gradient loading strip */}
      <div className="relative h-1 w-full overflow-hidden bg-primary/20">
        <div
          className={cn(
            "absolute inset-y-0 h-full w-1/3",
            "bg-gradient-to-r from-transparent via-primary to-transparent",
            "animate-[shimmer_1.5s_ease-in-out_infinite]",
          )}
        />
      </div>
      {/* Optional message below the strip */}
      <div className="bg-background/80 px-4 py-1.5 text-center text-xs text-muted-foreground backdrop-blur-sm">
        {syncContext.message}
      </div>
    </div>
  );
}
