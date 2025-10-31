import { Button, Icons } from "@wealthfolio/ui";

interface ActivityPaginationProps {
  hasMore: boolean;
  onLoadMore: () => void;
  isFetching: boolean;
  totalFetched: number;
  totalCount: number;
}

export function ActivityPagination({
  hasMore,
  onLoadMore,
  isFetching,
  totalFetched,
  totalCount,
}: ActivityPaginationProps) {
  return (
    <div className="mt-3 flex shrink-0 flex-col gap-3 sm:gap-4">
      <div className="relative flex flex-col items-center justify-center gap-2 sm:flex-row">
        <div className="text-muted-foreground order-2 flex items-center gap-2 text-xs sm:absolute sm:left-0 sm:order-1">
          {isFetching && !hasMore ? <Icons.Spinner className="h-4 w-4 animate-spin" /> : null}
          <span>
            {totalFetched} / {totalCount} activities
          </span>
        </div>
        {hasMore && (
          <Button
            onClick={onLoadMore}
            variant="outline"
            disabled={isFetching}
            className="order-1 gap-2 sm:order-2"
          >
            {isFetching ? (
              <Icons.Spinner className="h-4 w-4 animate-spin" />
            ) : (
              <Icons.ChevronDown className="h-4 w-4" />
            )}
            {isFetching ? "Loading…" : "Load more..."}
          </Button>
        )}
      </div>
    </div>
  );
}
