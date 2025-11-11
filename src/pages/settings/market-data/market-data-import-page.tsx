import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Icons } from "@/components/ui/icons";
import { Separator } from "@/components/ui/separator";

import { SettingsHeader } from "../settings-header";

import { ImportQuotesSection } from "@/pages/settings/market-data/components/quote-import-section";

export default function MarketDataImportPage() {
  const { t } = useTranslation("settings");

  return (
    <div className="space-y-6">
      <SettingsHeader
        heading={t("marketData.import.title")}
        text={t("marketData.import.description")}
        backTo="/settings/market-data"
      >
        <Button asChild variant="outline" size="sm" className="hidden sm:inline-flex">
          <Link to="/settings/market-data">
            <Icons.ArrowLeft className="mr-2 h-4 w-4" />
            {t("marketData.import.backToProviders")}
          </Link>
        </Button>
      </SettingsHeader>
      <Separator />
      <ImportQuotesSection showTitle={false} />
    </div>
  );
}
