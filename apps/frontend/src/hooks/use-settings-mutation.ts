import { logger, updateSettings } from "@/adapters";
import { toast } from "@wealthfolio/ui/components/ui/use-toast";
import i18n from "@/i18n/i18n";
import { QueryKeys } from "@/lib/query-keys";
import { Settings } from "@/lib/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";

export function useSettingsMutation(
  setSettings: React.Dispatch<React.SetStateAction<Settings | null>>,
  applySettingsToDocument: (newSettings: Settings) => void,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateSettings,
    onSuccess: (updatedSettings, variables) => {
      queryClient.invalidateQueries({ queryKey: [QueryKeys.SETTINGS] });
      setSettings(updatedSettings);
      applySettingsToDocument(updatedSettings);
      // Don't show toast during onboarding
      const isOnboarding =
        "onboardingCompleted" in variables || !updatedSettings.onboardingCompleted;
      if (!isOnboarding) {
        toast({
          title: i18n.t("toast.settings.updated_title"),
          description: i18n.t("toast.settings.updated_description"),
          variant: "success",
          duration: 1000,
        });
      }
    },
    onError: (error) => {
      logger.error(`Error updating settings: ${error}`);
      toast({
        title: i18n.t("toast.settings.update_failed_title"),
        description: i18n.t("toast.settings.update_failed_description"),
        variant: "destructive",
      });
    },
  });
}
