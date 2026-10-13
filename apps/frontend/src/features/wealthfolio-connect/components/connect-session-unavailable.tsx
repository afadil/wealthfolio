import { Button, Card, CardContent, CardHeader, CardTitle } from "@wealthfolio/ui";
import { useTranslation } from "react-i18next";
import { useWealthfolioConnect } from "../providers/wealthfolio-connect-provider";

export function ConnectSessionUnavailable() {
  const { t } = useTranslation();
  const { retrySession, isInitializing } = useWealthfolioConnect();
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {t("connect:session.unavailable", { defaultValue: "Connect is temporarily unavailable" })}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-muted-foreground">
          {t("connect:session.localAvailable", {
            defaultValue: "Your local portfolio is available. Retry to reconnect.",
          })}
        </p>
        <Button disabled={isInitializing} onClick={() => void retrySession()}>
          {t("common:retry")}
        </Button>
      </CardContent>
    </Card>
  );
}
