import { Card } from "@wealthfolio/ui/components/ui/card";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import React from "react";

const features = [
  {
    icon: Icons.RefreshCw,
    title: "Brokerage Sync",
    description: "Auto-sync your accounts and transactions into your local database daily.",
    color: "orange",
  },
  {
    icon: Icons.Users,
    title: "Household View",
    description: "Share selected accounts with family and see an aggregated view together.",
    color: "blue",
  },
  {
    icon: Icons.Laptop,
    title: "Device Sync",
    description: "Keep your database in sync across all devices with end-to-end encryption.",
    color: "green",
  },
];

const colorClasses = {
  orange: {
    bg: "bg-orange-100 dark:bg-orange-900/30",
    icon: "text-orange-600 dark:text-orange-400",
  },
  blue: {
    bg: "bg-blue-100 dark:bg-blue-900/30",
    icon: "text-blue-600 dark:text-blue-400",
  },
  green: {
    bg: "bg-green-100 dark:bg-green-900/30",
    icon: "text-green-600 dark:text-green-400",
  },
};

export const OnboardingConnect: React.FC = () => {
  return (
    <div className="w-full max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex flex-col items-center text-center">
        <div className="bg-secondary text-secondary-foreground mb-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium">
          <Icons.Sparkles className="h-3.5 w-3.5" />
          Optional
        </div>
        <h2 className="mb-2 text-xl font-semibold">Wealthfolio Connect</h2>
        <p className="text-muted-foreground text-sm">
          Automatically sync your brokers while keeping your data private.
        </p>
      </div>

      {/* Features */}
      <div className="grid gap-4 sm:grid-cols-3">
        {features.map((feature) => {
          const colors = colorClasses[feature.color as keyof typeof colorClasses];
          return (
            <Card key={feature.title} className="border p-5">
              <div className="flex flex-col items-center text-center">
                <div className={`mb-4 rounded-xl p-3 ${colors.bg}`}>
                  <feature.icon className={`h-6 w-6 ${colors.icon}`} />
                </div>
                <h3 className="mb-2 font-semibold">{feature.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {feature.description}
                </p>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Trust badge */}
      <div className="flex justify-center">
        <div className="text-muted-foreground inline-flex items-center gap-2 text-xs">
          <Icons.ShieldCheck className="h-4 w-4 text-green-600 dark:text-green-400" />
          <span>SOC 2 Type II certified · Your credentials are never stored</span>
        </div>
      </div>

      {/* Learn more link */}
      <div className="flex justify-center">
        <a
          href="https://wealthfolio.app/connect/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm transition-colors"
        >
          Learn more about Connect
          <Icons.ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>
    </div>
  );
};
