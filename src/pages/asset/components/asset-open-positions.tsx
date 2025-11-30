import type { OpenPosition } from "@/pages/trading/types";
import { OpenTradesTable } from "@/components/open-trades-table";
import { Card, CardContent, CardHeader, CardTitle, Icons } from "@wealthvn/ui";
import { useTranslation } from "react-i18next";

interface AssetOpenPositionsProps {
  openPositions: OpenPosition[];
  isLoading: boolean;
}

export function AssetOpenPositions({ openPositions, isLoading }: AssetOpenPositionsProps) {
  const { t } = useTranslation("trading");

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-center py-8">
            <Icons.Spinner className="h-6 w-6 animate-spin" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!openPositions || openPositions.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{t("components.openTrades.title", { defaultValue: "Open Positions" })}</CardTitle>
        </CardHeader>
        <CardContent>
          <OpenTradesTable positions={openPositions} showFilters={false} showSearch={false} />
        </CardContent>
      </Card>
    </div>
  );
}
