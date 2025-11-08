import { getVersion } from "@tauri-apps/api/app";
import { appDataDir, appLogDir } from "@tauri-apps/api/path";
import { check } from "@tauri-apps/plugin-updater";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Icons } from "@/components/ui/icons";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/components/ui/use-toast";
import { usePlatform } from "@/hooks/use-platform";
import { SettingsHeader } from "../settings-header";

export default function AboutSettingsPage() {
  const { t } = useTranslation("settings");
  const [version, setVersion] = useState<string>("");
  const [dbDir, setDbDir] = useState<string>("");
  const [logsDir, setLogsDir] = useState<string>("");
  const { isMobile } = usePlatform();

  useEffect(() => {
    // Load version
    getVersion()
      .then(setVersion)
      .catch(() => setVersion("")); // ignore errors

    // Resolve directories (OS-specific via Tauri path API) - only on desktop
    if (!isMobile) {
      (async () => {
        try {
          const dataDir = await appDataDir();
          setDbDir(dataDir);
        } catch {
          setDbDir("");
        }
        try {
          const logDir = await appLogDir();
          setLogsDir(logDir);
        } catch {
          setLogsDir("");
        }
      })();
    }
  }, [isMobile]);

  const handleCheckForUpdates = async () => {
    try {
      const update = await check();
      if (update) {
        toast({
          title: t("about_update_available"),
          description: t("about_update_available_description", { version: update.version }),
        });
      } else {
        toast({ title: t("about_up_to_date"), description: t("about_up_to_date_description") });
      }
    } catch (error) {
      toast({
        title: t("about_update_error"),
        description: t("about_update_error_description"),
        variant: "destructive",
      });
      console.error("Failed to check for updates:", error);
    }
  };

  const handleCopy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: t("about_copied"), description: t("about_copied_description", { label }) });
    } catch (error) {
      toast({
        title: t("about_copy_failed"),
        description: t("about_copy_failed_description", { label: label.toLowerCase() }),
        variant: "destructive",
      });
      console.error("Failed to copy to clipboard:", error);
    }
  };

  const handleOpenLink = (url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="space-y-6">
      <SettingsHeader heading={t("about_title")} text={t("about_description")} />
      <Separator />

      <Card>
        <CardHeader className="flex flex-row items-center gap-4">
          <img src="/logo.svg" alt="Wealthfolio logo" className="h-12 w-12 rounded-md shadow" />
          <div className="flex flex-col">
            <CardTitle className="text-xl">{t("about_app_name")}</CardTitle>
            <CardDescription>{t("about_version", { version: version || "N/A" })}</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <p className="text-muted-foreground text-sm">
              {t("about_tagline")}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              {!isMobile && <Button onClick={handleCheckForUpdates}>{t("about_check_update_button")}</Button>}
              <Button
                variant="outline"
                onClick={() => handleOpenLink("https://wealthfolio.app")}
                className="inline-flex items-center gap-2"
              >
                <Icons.Globe className="h-4 w-4" />
                {t("about_website_button")}
              </Button>
              <Button
                variant="outline"
                onClick={() => handleOpenLink("https://wealthfolio.app/docs/introduction/")}
                className="inline-flex items-center gap-2"
              >
                <Icons.FileText className="h-4 w-4" />
                {t("about_docs_button")}
              </Button>
              <Button
                variant="outline"
                onClick={() => handleOpenLink("https://github.com/afadil/wealthfolio")}
                className="inline-flex items-center gap-2"
              >
                <Icons.ExternalLink className="h-4 w-4" />
                {t("about_github_button")}
              </Button>
            </div>
          </div>

          {!isMobile && (
            <>
              <Separator />

              <div className="grid gap-4">
                <div className="space-y-1">
                  <p className="text-muted-foreground text-xs tracking-wide uppercase">
                    {t("about_database_directory")}
                  </p>
                  <div className="flex items-center gap-2">
                    <p className="bg-muted text-muted-foreground flex-1 truncate rounded-md px-3 py-2 font-mono text-xs">
                      {dbDir || t("about_unavailable")}
                    </p>
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={!dbDir}
                      onClick={() => dbDir && handleCopy(dbDir, t("about_database_directory"))}
                    >
                      <Icons.Copy className="h-4 w-4" />
                      <span className="sr-only">{t("about_copy_aria", { label: t("about_database_directory") })}</span>
                    </Button>
                  </div>
                  <p className="text-muted-foreground text-xs" dangerouslySetInnerHTML={{ __html: t("about_database_file") }} />
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground text-xs tracking-wide uppercase">
                    {t("about_logs_directory")}
                  </p>
                  <div className="flex items-center gap-2">
                    <p className="bg-muted text-muted-foreground flex-1 truncate rounded-md px-3 py-2 font-mono text-xs">
                      {logsDir || t("about_unavailable")}
                    </p>
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={!logsDir}
                      onClick={() => logsDir && handleCopy(logsDir, t("about_logs_directory"))}
                    >
                      <Icons.Copy className="h-4 w-4" />
                      <span className="sr-only">{t("about_copy_aria", { label: t("about_logs_directory") })}</span>
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}

          <Separator />

          <div className="space-y-4">
            <p className="text-muted-foreground text-sm">
              {t("about_support_message")}{" "}
              <span className="font-mono font-semibold select-all">wealthfolio@teymz.com</span>
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleOpenLink("mailto:wealthfolio@teymz.com")}
                className="inline-flex items-center gap-2"
              >
                <Icons.ExternalLink className="h-4 w-4" />
                {t("about_email_button")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleOpenLink("https://github.com/afadil/wealthfolio/issues")}
                className="inline-flex items-center gap-2"
              >
                <Icons.AlertCircle className="h-4 w-4" />
                {t("about_report_issue_button")}
              </Button>
            </div>

            <Separator />

            <p className="text-muted-foreground text-sm">
              <a
                href="https://wealthfolio.app/legal/privacy-policy"
                target="_blank"
                rel="noreferrer noopener"
                className="hover:text-foreground underline underline-offset-4"
              >
                {t("about_privacy_policy")}
              </a>
              <span className="mx-2">•</span>
              <a
                href="https://wealthfolio.app/legal/terms-of-use"
                target="_blank"
                rel="noreferrer noopener"
                className="hover:text-foreground underline underline-offset-4"
              >
                {t("about_terms_of_use")}
              </a>
              <span className="mx-2">•</span>
              <a
                href="https://wealthfolio.app"
                target="_blank"
                rel="noreferrer noopener"
                className="hover:text-foreground underline underline-offset-4"
              >
                {t("about_website_link")}
              </a>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
