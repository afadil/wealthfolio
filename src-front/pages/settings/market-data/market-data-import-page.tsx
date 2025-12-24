import { Link } from "react-router-dom";

import { Button } from "@wealthfolio/ui/components/ui/button";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { Separator } from "@wealthfolio/ui/components/ui/separator";

import { SettingsHeader } from "../settings-header";

import { ImportQuotesSection } from "@/pages/settings/market-data/components/quote-import-section";

export default function MarketDataImportPage() {
  return (
    <div className="space-y-6">
      <SettingsHeader
        heading="Import Historical Quotes"
        text="Upload CSV files to backfill market data for your portfolio."
        backTo="/settings/market-data"
      >
        <Button asChild variant="outline" size="sm" className="hidden sm:inline-flex">
          <Link to="/settings/market-data">
            <Icons.ArrowLeft className="mr-2 h-4 w-4" />
            Back to providers
          </Link>
        </Button>
      </SettingsHeader>
      <Separator />
      <ImportQuotesSection showTitle={false} />
    </div>
  );
}
