import { ConnectedView, LoginForm, useWealthfolioConnect } from "@/features/wealthfolio-connect";
import { Card, CardDescription, CardHeader, CardTitle } from "@wealthfolio/ui";
import { Button } from "@wealthfolio/ui/components/ui/button";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { Separator } from "@wealthfolio/ui/components/ui/separator";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { SettingsHeader } from "../settings-header";

export default function ConnectSettingsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isEnabled, isConnected, isInitializing } = useWealthfolioConnect();

  // Show "not configured" state when Connect feature is disabled
  if (!isEnabled) {
    return (
      <div className="space-y-6">
        <SettingsHeader
          heading={t("settings.connect.heading")}
          text={t("settings.connect.description")}
        />
        <Separator />
        <Card className="border-none bg-transparent py-6 shadow-none">
          <CardHeader className="items-center space-y-3 text-center">
            <div className="bg-muted mb-1 flex h-14 w-14 items-center justify-center rounded-full">
              <Icons.CloudOff className="text-muted-foreground h-6 w-6" />
            </div>
            <CardTitle>{t("settings.connect.not_configured_title")}</CardTitle>
            <CardDescription className="max-w-md">
              {t("settings.connect.not_configured_description")}
            </CardDescription>
            <Button className="mt-2 h-11 rounded-full px-6" onClick={() => navigate("/connect")}>
              <Icons.Plus className="mr-1 h-4 w-4" />
              {t("settings.connect.not_configured_cta")}
            </Button>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (isInitializing) {
    return (
      <div className="space-y-6">
        <SettingsHeader
          heading={t("settings.connect.heading")}
          text={t("settings.connect.description")}
        />
        <Separator />
        <div className="flex items-center justify-center py-12">
          <Icons.Spinner className="text-muted-foreground h-8 w-8 animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SettingsHeader
        heading={t("settings.connect.heading")}
        text={t("settings.connect.description_extended")}
      />
      <Separator />
      {isConnected ? <ConnectedView /> : <LoginForm />}
    </div>
  );
}
