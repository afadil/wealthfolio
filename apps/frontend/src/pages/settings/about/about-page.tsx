import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { getAppInfo } from "@/adapters";
import { ExternalLink } from "@/components/external-link";
import { usePlatform } from "@/hooks/use-platform";
import { useCheckForUpdates } from "@/hooks/use-updater";
import { Button } from "@wealthfolio/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@wealthfolio/ui/components/ui/card";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { Separator } from "@wealthfolio/ui/components/ui/separator";
import { toast } from "@wealthfolio/ui/components/ui/use-toast";
import { SettingsHeader } from "../settings-header";

export default function AboutSettingsPage() {
  const { t } = useTranslation();
  const [version, setVersion] = useState<string>("");
  const [dbPath, setDbPath] = useState<string>("");
  const [logsDir, setLogsDir] = useState<string>("");
  const { isMobile } = usePlatform();
  const checkUpdateMutation = useCheckForUpdates();

  useEffect(() => {
    // Use unified command for both desktop and web
    if (!isMobile) {
      getAppInfo().then((info) => {
        setVersion(info.version);
        setDbPath(info.dbPath || "");
        setLogsDir(info.logsDir);
      });
    } else {
      // On mobile, only get version
      getAppInfo().then((info) => {
        setVersion(info.version);
        setDbPath(info.dbPath || "");
      });
    }
  }, [isMobile]);

  const handleCheckForUpdates = () => {
    checkUpdateMutation.mutate();
  };

  const isCheckingUpdate = checkUpdateMutation.isPending;

  const handleCopy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast({
        title: t("settings.about.copied_title"),
        description: t("settings.about.copied_description", { label }),
      });
    } catch (error) {
      toast({
        title: t("settings.about.copy_failed_title"),
        description: t("settings.about.copy_failed_description", { label: label.toLowerCase() }),
        variant: "destructive",
      });
      console.error("Failed to copy to clipboard:", error);
    }
  };

  return (
    <div className="space-y-6">
      <SettingsHeader
        heading={t("settings.nav.about.title")}
        text={t("settings.nav.about.subtitle")}
      />
      <Separator />

      <Card>
        <CardHeader className="flex flex-row items-center gap-4">
          <img
            src="/logo.svg"
            alt={t("settings.about.logo_alt")}
            className="h-12 w-12 rounded-md shadow"
          />
          <div className="flex flex-col">
            <CardTitle className="text-xl">Wealthfolio</CardTitle>
            <CardDescription>
              {t("settings.about.version", { version: version || "N/A" })}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <p className="text-muted-foreground text-sm">
              {t("settings.about.description")}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {!isMobile && (
                <Button size="sm" onClick={handleCheckForUpdates} disabled={isCheckingUpdate}>
                  {t("settings.about.check_for_update")}
                </Button>
              )}
              <Button
                asChild
                variant="outline"
                size="sm"
                className="inline-flex items-center gap-2"
              >
                <ExternalLink href="https://wealthfolio.app">
                  <Icons.Globe className="h-4 w-4" />
                  {t("settings.about.website")}
                </ExternalLink>
              </Button>
              <Button
                asChild
                variant="outline"
                size="sm"
                className="inline-flex items-center gap-2"
              >
                <ExternalLink href="https://wealthfolio.app/docs/introduction/">
                  <Icons.FileText className="h-4 w-4" />
                  {t("settings.about.docs")}
                </ExternalLink>
              </Button>
              <Button
                asChild
                variant="outline"
                size="sm"
                className="inline-flex items-center gap-2"
              >
                <ExternalLink href="https://github.com/afadil/wealthfolio">
                  <Icons.ExternalLink className="h-4 w-4" />
                  GitHub
                </ExternalLink>
              </Button>
            </div>
          </div>

          {!isMobile && (
            <>
              <Separator />

              <div className="grid gap-4">
                <div className="space-y-1">
                  <p className="text-muted-foreground text-xs uppercase tracking-wide">
                    {t("settings.about.database_path")}
                  </p>
                  <div className="flex items-center gap-2">
                    <p className="bg-muted text-muted-foreground flex-1 truncate rounded-md px-3 py-2 font-mono text-xs">
                      {dbPath || t("settings.about.unavailable")}
                    </p>
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={!dbPath}
                      onClick={() => dbPath && handleCopy(dbPath, t("settings.about.database_path"))}
                    >
                      <Icons.Copy className="h-4 w-4" />
                      <span className="sr-only">{t("settings.about.copy_database_path")}</span>
                    </Button>
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground text-xs uppercase tracking-wide">
                    {t("settings.about.logs_directory")}
                  </p>
                  <div className="flex items-center gap-2">
                    <p className="bg-muted text-muted-foreground flex-1 truncate rounded-md px-3 py-2 font-mono text-xs">
                      {logsDir || t("settings.about.unavailable")}
                    </p>
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={!logsDir}
                      onClick={() => logsDir && handleCopy(logsDir, t("settings.about.logs_directory"))}
                    >
                      <Icons.Copy className="h-4 w-4" />
                      <span className="sr-only">{t("settings.about.copy_logs_directory")}</span>
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}

          <Separator />

          <div className="space-y-4">
            <p className="text-muted-foreground text-sm">
              {t("settings.about.support_text")}{" "}
              <span className="select-all font-mono font-semibold">support@wealthfolio.app</span>
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                asChild
                variant="outline"
                size="sm"
                className="inline-flex items-center gap-2"
              >
                <ExternalLink href="mailto:support@wealthfolio.app">
                  <Icons.ExternalLink className="h-4 w-4" />
                  {t("settings.about.email_us")}
                </ExternalLink>
              </Button>
              <Button
                asChild
                variant="outline"
                size="sm"
                className="inline-flex items-center gap-2"
              >
                <ExternalLink href="https://github.com/afadil/wealthfolio/issues">
                  <Icons.AlertCircle className="h-4 w-4" />
                  {t("settings.about.report_issue")}
                </ExternalLink>
              </Button>
            </div>

            <Separator />

            <p className="text-muted-foreground text-sm">
              <ExternalLink
                href="https://wealthfolio.app/legal/privacy-policy"
                className="hover:text-foreground underline underline-offset-4"
              >
                {t("settings.about.privacy_policy")}
              </ExternalLink>
              <span className="mx-2">•</span>
              <ExternalLink
                href="https://wealthfolio.app/legal/terms-of-use"
                className="hover:text-foreground underline underline-offset-4"
              >
                {t("settings.about.terms_of_use")}
              </ExternalLink>
              <span className="mx-2">•</span>
              <ExternalLink
                href="https://wealthfolio.app"
                className="hover:text-foreground underline underline-offset-4"
              >
                {t("settings.about.website")}
              </ExternalLink>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
