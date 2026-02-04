import { Button } from "@wealthfolio/ui/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@wealthfolio/ui/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@wealthfolio/ui/components/ui/table";
import { AmountDisplay, Skeleton } from "@wealthfolio/ui";
import { useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { getHoldingsByAllocation } from "@/adapters";
import { TickerAvatar } from "@/components/ticker-avatar";
import type { TaxonomyAllocation, HoldingSummary, AllocationHoldings } from "@/lib/types";
import { QueryKeys } from "@/lib/query-keys";
import { CompactAllocationStrip } from "./compact-allocation-strip";

interface AllocationDetailSheetProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  allocation?: TaxonomyAllocation;
  accountId: string;
  baseCurrency: string;
  initialCategoryId?: string | null;
}

export function AllocationDetailSheet({
  isOpen,
  onOpenChange,
  allocation,
  accountId,
  baseCurrency,
  initialCategoryId,
}: AllocationDetailSheetProps) {
  const navigate = useNavigate();
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [selectedCategoryName, setSelectedCategoryName] = useState<string | null>(null);

  // Set initial category when sheet opens
  useEffect(() => {
    if (isOpen && allocation?.categories?.length) {
      const categoryId = initialCategoryId ?? allocation.categories[0]?.categoryId ?? null;
      const category = allocation.categories.find((c) => c.categoryId === categoryId);
      if (category) {
        setSelectedCategoryId(category.categoryId);
        setSelectedCategoryName(category.categoryName);
      }
    }
  }, [isOpen, initialCategoryId, allocation?.categories]);

  // Find the selected category to get its details
  const selectedCategory = allocation?.categories?.find(
    (cat) => cat.categoryId === selectedCategoryId,
  );

  // Fetch holdings for the selected category
  const { data: allocationHoldings, isLoading: holdingsLoading } = useQuery({
    queryKey: [
      QueryKeys.HOLDINGS_BY_ALLOCATION,
      accountId,
      allocation?.taxonomyId,
      selectedCategoryId,
    ],
    queryFn: () =>
      getHoldingsByAllocation(accountId, allocation?.taxonomyId ?? "", selectedCategoryId ?? ""),
    enabled: !!selectedCategoryId && !!allocation?.taxonomyId,
    staleTime: 30000, // Cache for 30 seconds
  });

  // Extract holdings array from the response
  const holdings = allocationHoldings?.holdings;

  const handleSegmentClick = useCallback((categoryId: string, categoryName: string) => {
    setSelectedCategoryId(categoryId);
    setSelectedCategoryName(categoryName);
  }, []);

  const handleRowClick = useCallback(
    (categoryId: string) => {
      const category = allocation?.categories?.find((cat) => cat.categoryId === categoryId);
      if (category) {
        setSelectedCategoryId(categoryId);
        setSelectedCategoryName(category.categoryName);
      }
    },
    [allocation?.categories],
  );

  const handleHoldingClick = useCallback(
    (holding: HoldingSummary) => {
      onOpenChange(false);
      navigate(`/holdings/${encodeURIComponent(holding.id)}`);
    },
    [navigate, onOpenChange],
  );

  const handleClearSelection = useCallback(() => {
    setSelectedCategoryId(null);
    setSelectedCategoryName(null);
  }, []);

  // Reset selection when sheet closes
  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        setSelectedCategoryId(null);
        setSelectedCategoryName(null);
      }
      onOpenChange(open);
    },
    [onOpenChange],
  );

  const categories = allocation?.categories ?? [];
  const hasData = categories.length > 0;

  return (
    <Sheet open={isOpen} onOpenChange={handleOpenChange}>
      <SheetContent
        className="flex w-full flex-col overflow-hidden sm:max-w-xl"
        style={{
          paddingTop: "max(env(safe-area-inset-top, 0px), 1.5rem)",
        }}
      >
        <SheetHeader className="mt-4">
          <SheetTitle>{allocation?.taxonomyName ?? "Allocation"}</SheetTitle>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto py-4">
          {/* Allocation Bar */}
          {hasData && (
            <CompactAllocationStrip
              title=""
              allocation={allocation}
              baseCurrency={baseCurrency}
              isLoading={false}
              onSegmentClick={handleSegmentClick}
            />
          )}

          {/* Category Table */}
          {hasData && (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                    <TableHead className="text-right">%</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categories.map((category) => (
                    <TableRow
                      key={category.categoryId}
                      className={`cursor-pointer transition-colors ${
                        selectedCategoryId === category.categoryId
                          ? "bg-muted"
                          : "hover:bg-muted/50"
                      }`}
                      onClick={() => handleRowClick(category.categoryId)}
                    >
                      <TableCell className="flex items-center gap-2">
                        <div
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: category.color }}
                        />
                        <span className="font-medium">{category.categoryName}</span>
                      </TableCell>
                      <TableCell className="text-right">
                        <AmountDisplay value={category.value} currency={baseCurrency} />
                      </TableCell>
                      <TableCell className="text-muted-foreground text-right">
                        {category.percentage.toFixed(1)}%
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Holdings List (shown when category selected) */}
          {selectedCategoryId && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">
                  Holdings in{" "}
                  <span style={{ color: selectedCategory?.color }}>{selectedCategoryName}</span>
                </h3>
                <Button variant="ghost" size="sm" onClick={handleClearSelection}>
                  Clear
                </Button>
              </div>

              {holdingsLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center gap-3 py-3">
                      <Skeleton className="h-9 w-9 rounded-full" />
                      <div className="flex-1 space-y-1.5">
                        <Skeleton className="h-4 w-16" />
                        <Skeleton className="h-3 w-32" />
                      </div>
                      <div className="space-y-1.5 text-right">
                        <Skeleton className="ml-auto h-4 w-20" />
                        <Skeleton className="ml-auto h-3 w-12" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : holdings && holdings.length > 0 ? (
                <div className="divide-y">
                  {holdings.map((holding) => (
                    <div
                      key={holding.id}
                      className="hover:bg-muted/30 flex cursor-pointer items-center gap-3 py-3 transition-colors"
                      onClick={() => handleHoldingClick(holding)}
                    >
                      <TickerAvatar symbol={holding.symbol} className="h-9 w-9" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{holding.symbol}</p>
                        <p className="text-muted-foreground truncate text-xs">
                          {holding.name ?? holding.symbol}
                        </p>
                      </div>
                      <div className="text-right">
                        <AmountDisplay
                          value={holding.marketValue}
                          currency={baseCurrency}
                          className="text-sm font-medium"
                        />
                        <p className="text-muted-foreground text-xs">
                          {holding.weightInCategory.toFixed(1)}%
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground py-4 text-center text-sm">
                  No holdings found in this category.
                </p>
              )}
            </div>
          )}

          {!hasData && (
            <p className="text-muted-foreground py-8 text-center">No allocation data available.</p>
          )}
        </div>

        <SheetFooter className="border-t pt-4">
          <SheetClose asChild>
            <Button variant="outline" className="w-full">
              Close
            </Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
