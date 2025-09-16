import { Button } from "@/components/ui/button";
import { Icons } from "@/components/ui/icons";
import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface OnboardingStep1Props {
  onNext: () => void;
}

export const OnboardingStep1: React.FC<OnboardingStep1Props> = ({ onNext }) => {
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 sm:px-6 lg:px-8">
      {/* Hero Section */}
      <div className="text-center">
        <p className="text-muted-foreground mx-auto max-w-2xl text-lg sm:text-xl">
          First, let's explore the different ways you can track your assets and manage your
          portfolio.
        </p>
      </div>

      {/* Tracking Options */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6">
        {/* Simple Tracking Card */}
        <Card className="group border-border/50 from-card to-card/80 hover:border-primary/50 relative overflow-hidden border-2 bg-linear-to-br transition-all duration-300 hover:shadow-lg">
          <div className="absolute inset-0 bg-linear-to-br from-green-500/5 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

          <CardHeader className="relative pb-4">
            <div className="mb-3 flex items-center gap-3">
              <div className="rounded-lg bg-green-100 p-2 dark:bg-green-900/30">
                <Icons.PlusCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <CardTitle className="text-xl font-semibold">Simple Tracking</CardTitle>
            </div>
            <CardDescription className="text-base leading-relaxed">
              Perfect for getting started quickly. Focus on your current holdings without worrying
              about transaction history.
            </CardDescription>
          </CardHeader>

          <CardContent className="relative space-y-4">
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 rounded-full bg-green-100 p-1 dark:bg-green-900/30">
                  <Icons.Check className="h-3 w-3 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="font-medium">Add Holdings</p>
                  <p className="text-muted-foreground text-sm">
                    Quickly increase your asset positions
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="mt-0.5 rounded-full bg-green-100 p-1 dark:bg-green-900/30">
                  <Icons.Check className="h-3 w-3 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="font-medium">Remove Holdings</p>
                  <p className="text-muted-foreground text-sm">
                    Reduce positions when you sell assets
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="mt-0.5 rounded-full bg-green-100 p-1 dark:bg-green-900/30">
                  <Icons.Check className="h-3 w-3 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="font-medium">Cash Management</p>
                  <p className="text-muted-foreground text-sm">Simple deposits and withdrawals</p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-900/20">
              <div className="flex items-start gap-2">
                <Icons.AlertCircle className="mt-0.5 h-4 w-4 text-amber-600 dark:text-amber-400" />
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  Holdings don't affect your cash balance - perfect for portfolio snapshots
                </p>
              </div>
            </div>

            <div className="bg-muted/50 rounded-lg p-3">
              <p className="text-muted-foreground text-sm font-medium">
                <Icons.Star className="mr-1.5 inline h-4 w-4 text-amber-500" />
                Best for: Quick setup, portfolio overview, beginners
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Full Tracking Card */}
        <Card className="group border-border/50 from-card to-card/80 hover:border-primary/50 relative overflow-hidden border-2 bg-linear-to-br transition-all duration-300 hover:shadow-lg">
          <div className="absolute inset-0 bg-linear-to-br from-blue-500/5 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

          <CardHeader className="relative pb-4">
            <div className="mb-3 flex items-center gap-3">
              <div className="rounded-lg bg-blue-100 p-2 dark:bg-blue-900/30">
                <Icons.BarChart className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <CardTitle className="text-xl font-semibold">Complete Tracking</CardTitle>
            </div>
            <CardDescription className="text-base leading-relaxed">
              Comprehensive portfolio management with detailed transaction history and precise
              performance analytics.
            </CardDescription>
          </CardHeader>

          <CardContent className="relative space-y-4">
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 rounded-full bg-blue-100 p-1 dark:bg-blue-900/30">
                  <Icons.Check className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="font-medium">Fund Your Account</p>
                  <p className="text-muted-foreground text-sm">
                    Start with deposits to track cash flow
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="mt-0.5 rounded-full bg-blue-100 p-1 dark:bg-blue-900/30">
                  <Icons.Check className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="font-medium">Trade Execution</p>
                  <p className="text-muted-foreground text-sm">
                    Record every buy and sell transaction
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="mt-0.5 rounded-full bg-blue-100 p-1 dark:bg-blue-900/30">
                  <Icons.Check className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="font-medium">Cash Flow Tracking</p>
                  <p className="text-muted-foreground text-sm">
                    Deposits, withdrawals, and transfers
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-900/20">
              <div className="flex items-start gap-2">
                <Icons.Info className="mt-0.5 h-4 w-4 text-blue-600 dark:text-blue-400" />
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  Trades automatically update cash balance - ensure you have sufficient funds
                </p>
              </div>
            </div>

            <div className="bg-muted/50 rounded-lg p-3">
              <p className="text-muted-foreground text-sm font-medium">
                <Icons.TrendingUp className="mr-1.5 inline h-4 w-4 text-green-500" />
                Best for: Detailed analysis, tax reporting, performance tracking
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Action Button */}
      <div className="flex justify-end pt-2">
        <Button
          onClick={onNext}
          size="lg"
          className="group from-primary to-primary/90 min-w-[200px] bg-linear-to-r shadow-lg transition-all duration-300 hover:shadow-xl"
        >
          Got it, Next: Set Preferences
          <Icons.ArrowRight className="ml-2 h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
        </Button>
      </div>

      {/* Guide Link - Footnote */}
      <div className="text-center">
        <p className="text-muted-foreground text-sm">
          You can mix both transaction types whenever you need them. For more details,{" "}
          <a
            href="https://wealthfolio.app/docs/concepts/activity-types"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground underline transition-colors"
          >
            → View quick guide
          </a>
        </p>
      </div>
    </div>
  );
};
