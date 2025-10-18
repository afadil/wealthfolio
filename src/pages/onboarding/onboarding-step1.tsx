import { Card } from "@/components/ui/card";
import { Icons } from "@/components/ui/icons";
import React from "react";

export const OnboardingStep1: React.FC = () => {
  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Hero Section */}
      <div className="text-center">
        <p className="text-muted-foreground mx-auto max-w-2xl text-base sm:text-lg">
          First, let&apos;s explore the different ways you can track your assets and manage your
          portfolio.
        </p>
      </div>

      <div className="mx-auto grid max-w-4xl gap-6 md:grid-cols-2">
        <Card className="group border-border/50 from-card to-card/80 hover:border-primary/50 relative overflow-hidden border-2 bg-linear-to-br p-6 transition-all duration-300 hover:shadow-lg">
          <div className="absolute inset-0 bg-linear-to-br from-green-500/5 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
          <div className="relative mb-4 flex items-start gap-4">
            <div className="rounded-lg bg-green-100 p-3 dark:bg-green-900/30">
              <Icons.Plus className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <div className="flex-1">
              <h3 className="mb-1 text-xl font-bold">Simple Tracking</h3>
              <p className="text-muted-foreground text-sm">Perfect for getting started quickly.</p>
            </div>
          </div>

          <p className="text-muted-foreground relative mb-4 text-sm">
            Focus on your current holdings without worrying about transaction history.
          </p>

          <div className="relative mb-4 space-y-3">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 rounded-full bg-green-100 p-1 dark:bg-green-900/30">
                <Icons.Check className="h-3 w-3 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-sm font-medium">Add Holdings</p>
                <p className="text-muted-foreground text-xs">
                  Quickly increase your asset positions
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="mt-0.5 rounded-full bg-green-100 p-1 dark:bg-green-900/30">
                <Icons.Check className="h-3 w-3 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-sm font-medium">Remove Holdings</p>
                <p className="text-muted-foreground text-xs">
                  Reduce positions when you sell assets
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="mt-0.5 rounded-full bg-green-100 p-1 dark:bg-green-900/30">
                <Icons.Check className="h-3 w-3 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-sm font-medium">Cash Management</p>
                <p className="text-muted-foreground text-xs">Simple deposits and withdrawals</p>
              </div>
            </div>
          </div>

          <div className="relative mb-4 rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-800 dark:bg-green-900/20">
            <div className="flex items-start gap-2">
              <Icons.Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-600 dark:text-green-400" />
              <p className="text-xs text-green-800 dark:text-green-200">
                Holdings don&apos;t affect your cash balance – perfect for portfolio snapshots
              </p>
            </div>
          </div>
        </Card>

        <Card className="group border-border/50 from-card to-card/80 hover:border-primary/50 relative overflow-hidden border-2 bg-linear-to-br p-6 transition-all duration-300 hover:shadow-lg">
          <div className="absolute inset-0 bg-linear-to-br from-blue-500/5 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
          <div className="relative mb-4 flex items-start gap-4">
            <div className="rounded-lg bg-blue-100 p-3 dark:bg-blue-900/30">
              <Icons.BarChart className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="flex-1">
              <h3 className="mb-1 text-xl font-bold">Complete Tracking</h3>
              <p className="text-muted-foreground text-sm">Comprehensive portfolio management.</p>
            </div>
          </div>

          <p className="text-muted-foreground relative mb-4 text-sm">
            Detailed transaction history and precise performance analytics.
          </p>

          <div className="relative mb-4 space-y-3">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 rounded-full bg-blue-100 p-1 dark:bg-blue-900/30">
                <Icons.Check className="h-3 w-3 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-sm font-medium">Fund Your Account</p>
                <p className="text-muted-foreground text-xs">
                  Start with deposits to track cash flow
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="mt-0.5 rounded-full bg-blue-100 p-1 dark:bg-blue-900/30">
                <Icons.Check className="h-3 w-3 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-sm font-medium">Trade Execution</p>
                <p className="text-muted-foreground text-xs">
                  Record every buy and sell transaction
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="mt-0.5 rounded-full bg-blue-100 p-1 dark:bg-blue-900/30">
                <Icons.Check className="h-3 w-3 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-sm font-medium">Cash Flow Tracking</p>
                <p className="text-muted-foreground text-xs">
                  Deposits, withdrawals, and transfers
                </p>
              </div>
            </div>
          </div>

          <div className="relative mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-900/20">
            <div className="flex items-start gap-2">
              <Icons.Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-600 dark:text-blue-400" />
              <p className="text-xs text-blue-800 dark:text-blue-200">
                Trades automatically update cash balance – ensure you have sufficient funds
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Guide Link - Footnote */}
      <div className="pb-4 text-center sm:pb-0">
        <p className="text-muted-foreground text-xs sm:text-sm">
          You can mix both transaction types whenever you need them. For more details,{" "}
          <a
            href="https://wealthfolio.app/docs/concepts/activity-types"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground underline transition-colors"
          >
            view our quick guide
          </a>
        </p>
      </div>
    </div>
  );
};
