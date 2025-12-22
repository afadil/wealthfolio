import { Card } from "@/components/ui/card";
import { Icons } from "@/components/ui/icons";
import React from "react";

export const OnboardingStep1: React.FC = () => {
  return (
    <div className="flex min-h-full items-center justify-center px-4 md:px-6 lg:px-8">
      <div className="w-full max-w-5xl space-y-4 md:space-y-8">
        <div className="text-center">
          <p className="text-muted-foreground text-sm md:text-base">
            Two ways to track your portfolio.
          </p>
        </div>

        <div className="mx-auto grid gap-5 md:grid-cols-2 md:gap-6 lg:gap-8">
          <Card className="group border-border/50 from-card to-card/80 hover:border-primary/50 relative flex flex-col overflow-hidden border-2 bg-linear-to-br p-5 transition-all duration-300 hover:shadow-lg md:p-6">
            <div className="absolute inset-0 bg-linear-to-br from-green-500/5 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
            <div className="relative mb-4 flex items-center gap-3 md:mb-8">
              <div className="rounded-lg bg-green-100 p-2.5 md:p-3 dark:bg-green-900/30">
                <Icons.Holdings className="h-5 w-5 text-green-600 md:h-6 md:w-6 dark:text-green-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold md:text-xl">Simple Tracking</h3>
                <p className="text-muted-foreground text-xs md:text-sm">
                  No transaction history needed
                </p>
              </div>
            </div>

            <div className="relative mb-4 flex-1 space-y-2.5 md:mb-8 md:space-y-4">
              <div className="flex items-center gap-2.5">
                <Icons.Check className="h-4 w-4 text-green-600 dark:text-green-400" />
                <p className="text-sm">Add/remove holdings instantly</p>
              </div>
              <div className="flex items-center gap-2.5">
                <Icons.Check className="h-4 w-4 text-green-600 dark:text-green-400" />
                <p className="text-sm">Simple cash deposits/withdrawals</p>
              </div>
              <div className="flex items-center gap-2.5">
                <Icons.Check className="h-4 w-4 text-green-600 dark:text-green-400" />
                <p className="text-sm">Perfect for portfolio snapshots</p>
              </div>
            </div>

            <div className="relative mt-auto rounded-md border border-green-200 bg-green-50 px-3 py-2.5 dark:border-green-800 dark:bg-green-900/20">
              <p className="text-xs text-green-800 md:text-sm dark:text-green-200">
                Holdings don&apos;t affect cash balance
              </p>
            </div>
          </Card>

          <Card className="group border-border/50 from-card to-card/80 hover:border-primary/50 relative flex flex-col overflow-hidden border-2 bg-linear-to-br p-5 transition-all duration-300 hover:shadow-lg md:p-6">
            <div className="absolute inset-0 bg-linear-to-br from-blue-500/5 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
            <div className="relative mb-4 flex items-center gap-3 md:mb-8">
              <div className="rounded-lg bg-blue-100 p-2.5 md:p-3 dark:bg-blue-900/30">
                <Icons.Activity className="h-5 w-5 text-blue-600 md:h-6 md:w-6 dark:text-blue-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold md:text-xl">Complete Tracking</h3>
                <p className="text-muted-foreground text-xs md:text-sm">Full transaction history</p>
              </div>
            </div>

            <div className="relative mb-4 flex-1 space-y-2.5 md:mb-8 md:space-y-4">
              <div className="flex items-center gap-2.5">
                <Icons.Check className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <p className="text-sm">Track every buy and sell</p>
              </div>
              <div className="flex items-center gap-2.5">
                <Icons.Check className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <p className="text-sm">Deposits, withdrawals, transfers</p>
              </div>
              <div className="flex items-center gap-2.5">
                <Icons.Check className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <p className="text-sm">Precise performance analytics</p>
              </div>
            </div>

            <div className="relative mt-auto rounded-md border border-blue-200 bg-blue-50 px-3 py-2.5 dark:border-blue-800 dark:bg-blue-900/20">
              <p className="text-xs text-blue-800 md:text-sm dark:text-blue-200">
                Trades update cash balance automatically
              </p>
            </div>
          </Card>
        </div>

        <div className="text-center">
          <p className="text-muted-foreground text-xs md:text-sm">
            Mix both types as needed.{" "}
            <a
              href="https://wealthfolio.app/docs/concepts/activity-types"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground underline transition-colors"
            >
              Learn more
            </a>
          </p>
        </div>
      </div>
    </div>
  );
};
