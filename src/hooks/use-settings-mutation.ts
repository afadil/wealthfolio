import { logger } from "@/adapters";
import { updateSettings } from "@/commands/settings";
import { toast } from "@/components/ui/use-toast";
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
    onSuccess: (updatedSettings) => {
      queryClient.invalidateQueries({ queryKey: [QueryKeys.SETTINGS] });
      setSettings(updatedSettings);
      applySettingsToDocument(updatedSettings);
    },
    onError: (error) => {
      logger.error(`Error updating settings: ${error}`);
      toast({
        title: "Uh oh! Something went wrong.",
        description: "There was a problem updating your settings.",
        variant: "destructive",
      });
    },
  });
}
