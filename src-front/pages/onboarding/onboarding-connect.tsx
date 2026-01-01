import { Button } from "@wealthfolio/ui/components/ui/button";
import { Card } from "@wealthfolio/ui/components/ui/card";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import React from "react";

interface OnboardingConnectProps {
  onSubscribe: () => void;
  onSkip: () => void;
  onBack: () => void;
}

const features = [
  {
    icon: Icons.CloudSync,
    title: "Auto Sync",
    description: "Automatically sync your brokerage accounts daily. No manual imports needed.",
  },
  {
    icon: Icons.ShieldCheck,
    title: "Privacy First",
    description: "Your data stays local. We only store encrypted tokens, never your financial data.",
  },
  {
    icon: Icons.Smartphone,
    title: "Multi-Device",
    description: "Sync across all your devices with end-to-end encryption.",
  },
];

export const OnboardingConnect: React.FC<OnboardingConnectProps> = ({
  onSubscribe,
  onSkip,
  onBack,
}) => {
  return (
    <div className="flex min-h-full items-center justify-center px-4 md:px-6 lg:px-8">
      <div className="w-full max-w-3xl space-y-6 md:space-y-8">
        {/* Header */}
        <div className="text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 dark:border-violet-800 dark:bg-violet-900/30">
            <Icons.Sparkles className="h-4 w-4 text-violet-600 dark:text-violet-400" />
            <span className="text-sm font-medium text-violet-700 dark:text-violet-300">Optional</span>
          </div>
          <h2 className="mb-2 text-2xl font-bold tracking-tight md:text-3xl">
            Want automatic portfolio sync?
          </h2>
          <p className="text-muted-foreground mx-auto max-w-xl text-sm md:text-base">
            Wealthfolio Connect automatically imports your transactions from supported brokers while
            keeping your data private.
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid gap-4 md:grid-cols-3">
          {features.map((feature) => (
            <Card
              key={feature.title}
              className="group border-border/50 from-card to-card/80 hover:border-violet-300 relative flex flex-col items-center overflow-hidden border bg-linear-to-br p-5 text-center transition-all duration-300 hover:shadow-lg dark:hover:border-violet-700"
            >
              <div className="absolute inset-0 bg-linear-to-br from-violet-500/5 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
              <div className="relative mb-3 rounded-xl bg-violet-100 p-3 transition-transform duration-300 group-hover:scale-110 dark:bg-violet-900/30">
                <feature.icon className="h-6 w-6 text-violet-600 dark:text-violet-400" />
              </div>
              <h3 className="relative mb-1 font-semibold">{feature.title}</h3>
              <p className="text-muted-foreground relative text-sm">{feature.description}</p>
            </Card>
          ))}
        </div>

        {/* CTA Section */}
        <div className="flex flex-col items-center gap-4">
          <Button
            onClick={onSubscribe}
            size="lg"
            className="group from-violet-600 to-violet-700 hover:from-violet-700 hover:to-violet-800 w-full bg-linear-to-r shadow-lg transition-all duration-300 hover:shadow-xl sm:w-auto sm:px-8"
          >
            <Icons.ExternalLink className="mr-2 h-4 w-4 transition-transform duration-300 group-hover:scale-110" />
            Subscribe & Connect
          </Button>

          <div className="flex items-center gap-4">
            <button
              onClick={onBack}
              className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm transition-colors"
            >
              <Icons.ArrowLeft className="h-3.5 w-3.5" />
              Back
            </button>
            <span className="text-muted-foreground/50">|</span>
            <a
              href="https://wealthfolio.app/connect/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm transition-colors"
            >
              Learn more
              <Icons.ArrowRight className="h-3.5 w-3.5" />
            </a>
            <span className="text-muted-foreground/50">|</span>
            <button
              onClick={onSkip}
              className="text-muted-foreground hover:text-foreground text-sm transition-colors"
            >
              Maybe later
            </button>
          </div>
        </div>

        {/* Trust Badge */}
        <div className="flex justify-center">
          <div className="inline-flex items-center gap-2 rounded-lg border px-4 py-2.5">
            <Icons.Shield className="text-muted-foreground h-4 w-4" />
            <span className="text-muted-foreground text-xs">
              SOC 2 Type II certified partner. Your credentials are never stored.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
