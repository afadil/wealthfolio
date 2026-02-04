import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/use-toast";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import {
  getUnusedVirtualStrategiesCount,
  getUnusedVirtualStrategies,
  cleanupUnusedVirtualStrategies,
  deleteUnusedVirtualStrategy,
} from "@/commands/rebalancing";
import type { RebalancingStrategy } from "@/lib/types";

export function AllocationMaintenanceForm() {
  const [isCleaningUp, setIsCleaningUp] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const queryClient = useQueryClient();

  // Query for unused virtual strategies count
  const { data: unusedCount = 0, refetch: refetchCount } = useQuery({
    queryKey: ["unused-virtual-strategies-count"],
    queryFn: getUnusedVirtualStrategiesCount,
  });

  // Query for unused virtual strategies list
  const { data: unusedStrategies = [], refetch: refetchList } = useQuery<RebalancingStrategy[]>({
    queryKey: ["unused-virtual-strategies"],
    queryFn: getUnusedVirtualStrategies,
    // Always enabled so data is fresh, React Query will cache it
  });

  // Mutation for cleanup all
  const cleanupMutation = useMutation({
    mutationFn: cleanupUnusedVirtualStrategies,
    onSuccess: (deletedCount) => {
      toast({
        title: "Cleanup complete",
        description: `Removed ${deletedCount} unused virtual ${deletedCount === 1 ? "portfolio" : "portfolios"}.`,
      });
      refetchCount();
      refetchList();
      queryClient.invalidateQueries({ queryKey: ["rebalancing-strategies"] });
    },
    onError: (error) => {
      console.error("Cleanup failed:", error);
      toast({
        title: "Error",
        description: "Failed to clean up unused virtual portfolios.",
        variant: "destructive",
      });
    },
  });

  // Mutation for deleting individual strategy
  const deleteMutation = useMutation({
    mutationFn: deleteUnusedVirtualStrategy,
    onSuccess: () => {
      toast({
        title: "Deleted",
        description: "Virtual portfolio removed successfully.",
      });
      refetchCount();
      refetchList();
      queryClient.invalidateQueries({ queryKey: ["rebalancing-strategies"] });
    },
    onError: (error) => {
      console.error("Delete failed:", error);
      toast({
        title: "Error",
        description: "Failed to delete virtual portfolio.",
        variant: "destructive",
      });
    },
  });

  async function handleCleanupAll() {
    setIsCleaningUp(true);
    await cleanupMutation.mutateAsync();
    setIsCleaningUp(false);
  }

  async function handleDeleteOne(id: string) {
    await deleteMutation.mutateAsync(id);
  }

  // Extract account names from virtual portfolio name
  // Format: "Virtual Portfolio: Account A + Account B"
  function extractAccountNames(name: string): string {
    const prefix = "Virtual Portfolio: ";
    if (name.startsWith(prefix)) {
      return name.substring(prefix.length);
    }
    return name;
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div className="space-y-3 rounded-lg border p-4">
        <div className="space-y-1">
          <h3 className="text-base font-medium">Virtual Portfolio Cleanup</h3>
          <p className="text-muted-foreground text-sm">
            When you select multiple accounts without saving as a portfolio, the app creates
            temporary virtual portfolios to store your allocation targets. Clean up unused ones to
            keep your data tidy.
          </p>
        </div>

        <div className="bg-muted/50 flex items-center justify-between rounded-lg p-3">
          <div className="text-sm">
            <span className="font-medium">{unusedCount}</span> unused virtual{" "}
            {unusedCount === 1 ? "portfolio" : "portfolios"}
          </div>
          <Button
            onClick={handleCleanupAll}
            disabled={isCleaningUp || unusedCount === 0}
            size="sm"
            variant="outline"
          >
            {isCleaningUp ? "Cleaning..." : "Clean Up All"}
          </Button>
        </div>

        {unusedCount > 0 && (
          <Collapsible open={isOpen} onOpenChange={setIsOpen}>
            <CollapsibleTrigger className="hover:bg-muted/50 flex w-full items-center justify-between rounded-lg border p-3 text-sm">
              <span className="font-medium">View unused portfolios</span>
              {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 space-y-2">
              {unusedStrategies.map((strategy) => (
                <div
                  key={strategy.id}
                  className="bg-card flex items-center justify-between rounded-lg border p-3 text-sm"
                >
                  <div className="flex-1">
                    <div className="font-medium">{extractAccountNames(strategy.name)}</div>
                  </div>
                  <Button
                    onClick={() => handleDeleteOne(strategy.id)}
                    disabled={deleteMutation.isPending}
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive h-8 w-8 p-0"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </CollapsibleContent>
          </Collapsible>
        )}
      </div>
    </div>
  );
}
