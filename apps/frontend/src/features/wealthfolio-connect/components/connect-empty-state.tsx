import { ExternalLink } from "@/components/external-link";
import { WEALTHFOLIO_CONNECT_PORTAL_URL } from "@/lib/constants";
import { Button } from "@wealthfolio/ui/components/ui/button";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { ConnectFlowDiagram } from "./connect-flow-diagram";

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

export function ConnectEmptyState() {
  const { t } = useTranslation("common");

  const features = [
    {
      icon: Icons.CloudSync2,
      titleKey: "connect.marketing.feature_broker_title",
      descKey: "connect.marketing.feature_broker_desc",
      color: "orange" as const,
    },
    {
      icon: Icons.Devices,
      titleKey: "connect.marketing.feature_device_title",
      descKey: "connect.marketing.feature_device_desc",
      color: "green" as const,
    },
    {
      icon: Icons.UserSwitch,
      titleKey: "connect.marketing.feature_household_title",
      descKey: "connect.marketing.feature_household_desc",
      color: "blue" as const,
    },
  ];

  return (
    <div className="flex min-h-[calc(100vh-12rem)] flex-col items-center justify-center px-4 py-6">
      <div className="w-full max-w-3xl space-y-8 sm:space-y-12">
        <header className="text-center">
          <img alt="Wealthfolio" className="mx-auto mb-4 h-16 w-16" src="/logo-vantage.png" />
          <div className="bg-secondary text-secondary-foreground mb-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium">
            <Icons.Sparkles className="h-3 w-3" />
            {t("connect.empty_state.optional_badge")}
          </div>
          <h1 className="mb-2 text-xl font-semibold tracking-tight">{t("connect.empty_state.title")}</h1>
          <p className="text-muted-foreground text-sm">{t("connect.empty_state.subtitle")}</p>
        </header>

        <section className="mx-auto max-w-2xl">
          <ConnectFlowDiagram />
        </section>

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-6">
          {features.map((feature) => {
            const colors = colorClasses[feature.color];
            return (
              <div key={feature.titleKey} className="flex items-center gap-3">
                <div className={`shrink-0 rounded-xl p-2.5 ${colors.bg}`}>
                  <feature.icon className={`h-5 w-5 ${colors.icon}`} />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-medium">{t(feature.titleKey)}</h3>
                  <p className="text-muted-foreground text-xs">{t(feature.descKey)}</p>
                </div>
              </div>
            );
          })}
        </section>

        <footer className="flex flex-col items-center gap-4">
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center sm:justify-center">
            <Button asChild className="from-primary to-primary/90 bg-linear-to-r w-full sm:w-auto">
              <ExternalLink href={WEALTHFOLIO_CONNECT_PORTAL_URL}>
                {t("connect.empty_state.cta_get_started")}
                <Icons.ExternalLink className="ml-1.5 h-4 w-4" />
              </ExternalLink>
            </Button>
            <Button variant="outline" asChild className="w-full sm:w-auto">
              <Link to="/settings/connect">
                <Icons.User className="mr-1.5 h-4 w-4" />
                {t("connect.empty_state.cta_login")}
              </Link>
            </Button>
          </div>
          <ExternalLink
            href="https://wealthfolio.app/connect/"
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs transition-colors"
          >
            {t("connect.empty_state.learn_more")}
            <Icons.ExternalLink className="h-3 w-3" />
          </ExternalLink>
        </footer>
      </div>
    </div>
  );
}
