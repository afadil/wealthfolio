import { Card } from "@wealthfolio/ui/components/ui/card";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import React from "react";

const features = [
  {
    icon: Icons.CloudSync2,
    title: "Brokerage Sync",
    description: "Auto-sync your accounts and transactions into your local database.",
    color: "orange",
  },
  {
    icon: Icons.Devices,
    title: "Device Sync",
    description: "Keep your database in sync across all devices with end-to-end encryption.",
    color: "green",
  },
  {
    icon: Icons.UserSwitch,
    title: "Household View",
    description: "Share selected accounts with family and see an aggregated view together.",
    color: "blue",
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
      <div className="grid gap-3 sm:grid-cols-3 sm:gap-4">
        {features.map((feature) => {
          const colors = colorClasses[feature.color as keyof typeof colorClasses];
          return (
            <Card key={feature.title} className="border p-3 sm:p-5">
              <div className="flex min-h-16 items-center gap-3 sm:min-h-0 sm:flex-col sm:text-center">
                <div
                  className={`shrink-0 rounded-lg p-2 sm:mb-4 sm:rounded-xl sm:p-3 ${colors.bg}`}
                >
                  <feature.icon className={`h-5 w-5 sm:h-6 sm:w-6 ${colors.icon}`} />
                </div>
                <div>
                  <h3 className="text-sm font-semibold sm:mb-2 sm:text-base">{feature.title}</h3>
                  <p className="text-muted-foreground text-xs leading-relaxed sm:text-sm">
                    {feature.description}
                  </p>
                </div>
              </div>
            </Card>
          );
        })}
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
