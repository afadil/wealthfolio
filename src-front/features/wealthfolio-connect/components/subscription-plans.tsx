import { getSubscriptionPlans } from "../services/broker-service";
import type { BillingPeriod, SubscriptionPlan } from "../types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Icons } from "@/components/ui/icons";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { WEALTHFOLIO_CONNECT_PORTAL_URL } from "@/lib/constants";
import { QueryKeys } from "@/lib/query-keys";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Custom Hooks
// ─────────────────────────────────────────────────────────────────────────────

function useSubscriptionPlans(enabled: boolean) {
  return useQuery({
    queryKey: [QueryKeys.SUBSCRIPTION_PLANS],
    queryFn: getSubscriptionPlans,
    enabled,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-Components
// ─────────────────────────────────────────────────────────────────────────────

function PlanCardSkeleton() {
  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-4">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="mt-2 h-4 w-full" />
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        <Skeleton className="mb-4 h-10 w-32" />
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-4 w-full" />
          ))}
        </div>
        <Skeleton className="mt-auto h-10 w-full" />
      </CardContent>
    </Card>
  );
}

interface PlanCardProps {
  plan: SubscriptionPlan;
  billingPeriod: BillingPeriod;
  isPopular?: boolean;
}

function PlanCard({ plan, billingPeriod, isPopular }: PlanCardProps) {
  const pricing = plan.pricing[billingPeriod];
  const yearlyPricing = plan.pricing.yearly;
  const monthlyPricing = plan.pricing.monthly;

  // Calculate savings for yearly billing
  const yearlySavings =
    billingPeriod === "yearly"
      ? Math.round(
          ((monthlyPricing.amount * 12 - yearlyPricing.amount) / (monthlyPricing.amount * 12)) *
            100,
        )
      : 0;

  const formatPrice = (amount: number, currency: string) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  return (
    <Card className={`relative flex flex-col ${isPopular ? "border-primary shadow-md" : ""}`}>
      {isPopular && (
        <Badge className="absolute -top-2.5 left-1/2 -translate-x-1/2" variant="default">
          Most Popular
        </Badge>
      )}
      <CardHeader className="pb-4">
        <CardTitle className="text-lg">{plan.name}</CardTitle>
        <CardDescription>{plan.description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        <div className="mb-6">
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-bold">
              {formatPrice(pricing.amount, pricing.currency)}
            </span>
            <span className="text-muted-foreground text-sm">
              /{billingPeriod === "monthly" ? "mo" : "yr"}
            </span>
          </div>
          {billingPeriod === "yearly" && yearlySavings > 0 && (
            <p className="text-sm text-green-600 dark:text-green-400">
              Save {yearlySavings}% vs monthly
            </p>
          )}
        </div>

        <ul className="mb-6 flex-1 space-y-2.5">
          {plan.features.map((feature, index) => (
            <li key={index} className="flex items-start gap-2 text-sm">
              <Icons.Check className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
              <span>{feature}</span>
            </li>
          ))}
        </ul>

        <Button
          className="w-full"
          variant={isPopular ? "default" : "outline"}
          onClick={() => window.open(`${WEALTHFOLIO_CONNECT_PORTAL_URL}/onboarding`, "_blank")}
        >
          Get Started
        </Button>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

interface SubscriptionPlansProps {
  enabled?: boolean;
}

export function SubscriptionPlans({ enabled = true }: SubscriptionPlansProps) {
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>("monthly");
  const { data, isLoading, error } = useSubscriptionPlans(enabled);

  if (error) {
    return (
      <Card className="border-warning/30 bg-warning/5">
        <CardContent className="py-8">
          <div className="flex flex-col items-center justify-center text-center">
            <div className="bg-warning/15 mb-4 rounded-full p-4">
              <Icons.CloudOff className="text-warning h-8 w-8" />
            </div>
            <h3 className="text-foreground mb-2 text-base font-medium">
              Unable to Load Plans
            </h3>
            <p className="text-muted-foreground mb-4 max-w-sm text-sm">
              We couldn't retrieve subscription plans right now. This is usually a temporary issue.
            </p>
            <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
              <Icons.Refresh className="mr-2 h-4 w-4" />
              Refresh Page
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-base font-medium">Choose Your Plan</CardTitle>
            <CardDescription>
              Subscribe to unlock Wealthfolio Sync features and connect your broker accounts.
            </CardDescription>
          </div>
          <ToggleGroup
            type="single"
            value={billingPeriod}
            onValueChange={(value) => value && setBillingPeriod(value as BillingPeriod)}
            className="bg-muted rounded-lg p-1"
          >
            <ToggleGroupItem
              value="monthly"
              aria-label="Monthly billing"
              className="data-[state=on]:bg-background rounded-md px-3 py-1.5 text-sm data-[state=on]:shadow-sm"
            >
              Monthly
            </ToggleGroupItem>
            <ToggleGroupItem
              value="yearly"
              aria-label="Yearly billing"
              className="data-[state=on]:bg-background rounded-md px-3 py-1.5 text-sm data-[state=on]:shadow-sm"
            >
              Yearly
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2">
            <PlanCardSkeleton />
            <PlanCardSkeleton />
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {data?.plans.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                billingPeriod={billingPeriod}
                isPopular={plan.id === "pro"}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
