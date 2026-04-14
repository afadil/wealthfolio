import { Card } from "@wealthfolio/ui/components/ui/card";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import React, { useState } from "react";
import { useTranslation } from "react-i18next";

export const OnboardingStep1: React.FC = () => {
  const { t } = useTranslation("common");
  const [selectedMode, setSelectedMode] = useState<"holdings" | "transactions">("holdings");
  return (
    <div className="w-full max-w-5xl space-y-4 md:space-y-6">
      <div className="text-center">
        <p className="text-muted-foreground">{t("onboarding.step1.subtitle")}</p>
      </div>

      <div className="mx-auto grid gap-5 px-2 md:grid-cols-2 md:gap-6 md:px-4 lg:gap-8">
        <Card
          role="button"
          tabIndex={0}
          onClick={() => setSelectedMode("holdings")}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              setSelectedMode("holdings");
            }
          }}
          className={`from-card to-card/80 bg-linear-to-br group relative flex cursor-pointer flex-col overflow-hidden border-2 p-5 transition-all duration-300 md:p-6 ${
            selectedMode === "holdings"
              ? "border-primary ring-primary/20 ring-2"
              : "border-border/50 hover:border-primary/50 hover:shadow-lg"
          }`}
        >
          <div className="bg-linear-to-br absolute inset-0 from-green-500/5 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

          {/* Header */}
          <div className="relative mb-3 flex items-center gap-3">
            <div className="shrink-0 rounded-lg bg-green-100 p-2 dark:bg-green-900/30">
              <Icons.Holdings className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <h3 className="text-lg font-bold md:text-xl">{t("onboarding.step1.holdings_title")}</h3>
              <p className="text-muted-foreground text-sm">{t("onboarding.step1.holdings_subtitle")}</p>
            </div>
          </div>

          {/* Decision badge - above the fold */}
          <div className="relative mb-6 rounded-md border border-green-200 bg-green-50 px-3 py-2 dark:border-green-800 dark:bg-green-900/20">
            <p className="text-xs text-green-800 md:text-sm dark:text-green-200">
              {t("onboarding.step1.holdings_badge")}
            </p>
          </div>

          {/* Features */}
          <div className="relative mb-6 flex-1 space-y-2 md:space-y-3">
            <div className="flex items-center gap-2.5">
              <Icons.Check className="h-4 w-4 text-green-600 dark:text-green-400" />
              <p className="text-sm">{t("onboarding.step1.holdings_feature_1")}</p>
            </div>
            <div className="flex items-center gap-2.5">
              <Icons.Check className="h-4 w-4 text-green-600 dark:text-green-400" />
              <p className="text-sm">{t("onboarding.step1.holdings_feature_2")}</p>
            </div>
            <div className="flex items-center gap-2.5">
              <Icons.Check className="h-4 w-4 text-green-600 dark:text-green-400" />
              <p className="text-sm">{t("onboarding.step1.holdings_feature_3")}</p>
            </div>
            <div className="flex items-center gap-2.5">
              <Icons.Check className="h-4 w-4 text-green-600 dark:text-green-400" />
              <p className="text-sm">{t("onboarding.step1.holdings_feature_4")}</p>
            </div>
          </div>

          {/* Limit & Note - softened */}
          <div className="text-muted-foreground/70 relative mt-auto space-y-2 text-xs">
            <p>{t("onboarding.step1.holdings_limit")}</p>
            <p>{t("onboarding.step1.holdings_note")}</p>
          </div>
        </Card>

        <Card
          role="button"
          tabIndex={0}
          onClick={() => setSelectedMode("transactions")}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              setSelectedMode("transactions");
            }
          }}
          className={`from-card to-card/80 bg-linear-to-br group relative flex cursor-pointer flex-col overflow-hidden border-2 p-5 transition-all duration-300 md:p-6 ${
            selectedMode === "transactions"
              ? "border-primary ring-primary/20 ring-2"
              : "border-border/50 hover:border-primary/50 hover:shadow-lg"
          }`}
        >
          <div className="bg-linear-to-br absolute inset-0 from-blue-500/5 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

          {/* Header */}
          <div className="relative mb-3 flex items-center gap-3">
            <div className="shrink-0 rounded-lg bg-blue-100 p-2 dark:bg-blue-900/30">
              <Icons.Activity className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h3 className="text-lg font-bold md:text-xl">{t("onboarding.step1.transactions_title")}</h3>
              <p className="text-muted-foreground text-sm">{t("onboarding.step1.transactions_subtitle")}</p>
            </div>
          </div>

          {/* Decision badge - above the fold */}
          <div className="relative mb-6 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 dark:border-blue-800 dark:bg-blue-900/20">
            <p className="text-xs text-blue-800 md:text-sm dark:text-blue-200">
              {t("onboarding.step1.transactions_badge")}
            </p>
          </div>

          {/* Features */}
          <div className="relative mb-6 flex-1 space-y-2 md:space-y-3">
            <div className="flex items-center gap-2.5">
              <Icons.Check className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <p className="text-sm">{t("onboarding.step1.transactions_feature_1")}</p>
            </div>
            <div className="flex items-center gap-2.5">
              <Icons.Check className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <p className="text-sm">{t("onboarding.step1.transactions_feature_2")}</p>
            </div>
            <div className="flex items-center gap-2.5">
              <Icons.Check className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <p className="text-sm">{t("onboarding.step1.transactions_feature_3")}</p>
            </div>
            <div className="flex items-center gap-2.5">
              <Icons.Check className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <p className="text-sm">{t("onboarding.step1.transactions_feature_4")}</p>
            </div>
          </div>

          {/* Limit & Note - softened */}
          <div className="text-muted-foreground/70 relative mt-auto space-y-2 text-xs">
            <p>{t("onboarding.step1.transactions_limit")}</p>
            <p>{t("onboarding.step1.transactions_note")}</p>
          </div>
        </Card>
      </div>

      <div className="text-center">
        <p className="text-muted-foreground text-xs">
          {t("onboarding.step1.footer_prefix")}{" "}
          <a
            href="https://wealthfolio.app/docs/concepts/activity-types"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground underline transition-colors"
          >
            {t("onboarding.step1.learn_more")}
          </a>
        </p>
      </div>
    </div>
  );
};
