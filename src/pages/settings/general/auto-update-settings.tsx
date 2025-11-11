import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useSettingsContext } from "@/lib/settings-provider";
import { updateSettings } from "@/commands/settings";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { QueryKeys } from "@/lib/query-keys";
import { toast } from "@/components/ui/use-toast";
import { useTranslation } from "react-i18next";

export function AutoUpdateSettings() {
  const { settings } = useSettingsContext();
  const queryClient = useQueryClient();
  const { t } = useTranslation("settings");

  const updateSettingsMutation = useMutation({
    mutationFn: updateSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QueryKeys.SETTINGS] });
      toast({
        title: t("general.autoUpdate.toast.successTitle"),
        description: t("general.autoUpdate.toast.successDescription"),
      });
    },
    onError: (error) => {
      toast({
        title: t("general.autoUpdate.toast.errorTitle"),
        description: t("general.autoUpdate.toast.errorDescription"),
        variant: "destructive",
      });
      console.error("Failed to update settings:", error);
    },
  });

  const handleAutoUpdateToggle = (enabled: boolean) => {
    if (!settings) return;

    updateSettingsMutation.mutate({
      ...settings,
      autoUpdateCheckEnabled: enabled,
    });
  };

  if (!settings) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t("general.autoUpdate.title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="auto-update-check" className="text-base">
              {t("general.autoUpdate.enableLabel")}
            </Label>
            <p className="text-muted-foreground text-xs">
              {t("general.autoUpdate.enableDescription")}
            </p>
          </div>
          <Switch
            id="auto-update-check"
            checked={settings.autoUpdateCheckEnabled}
            onCheckedChange={handleAutoUpdateToggle}
            disabled={updateSettingsMutation.isPending}
          />
        </div>
      </CardContent>
    </Card>
  );
}
