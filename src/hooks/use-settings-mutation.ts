import { useMutation } from '@tanstack/react-query';
import { toast } from '@/components/ui/use-toast';
import { saveSettings } from '@/commands/settings';
import { Settings } from '@/lib/types';
import { logger } from '@/adapters';

export function useSettingsMutation(
  setSettings: React.Dispatch<React.SetStateAction<Settings | null>>,
  applySettingsToDocument: (newSettings: Settings) => void,
) {
  return useMutation({
    mutationFn: saveSettings,
    onSuccess: (updatedSettings) => {
      setSettings(updatedSettings);
      applySettingsToDocument(updatedSettings);
      toast({
        title: 'Settings updated successfully.',
        variant: 'success',
      });
    },
    onError: (error) => {
      logger.error(`Error updating settings: ${error}`);
      toast({
        title: 'Uh oh! Something went wrong.',
        description: 'There was a problem updating your settings.',
        variant: 'destructive',
      });
    },
  });
}
