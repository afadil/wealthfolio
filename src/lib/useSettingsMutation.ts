import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/components/ui/use-toast';
import { saveSettings } from '@/commands/settings';
import { Settings } from './types';
import { useCalculateHistoryMutation } from '@/hooks/useCalculateHistory';
import { QueryKeys } from './query-keys';
import { logger } from '@/adapters';
import { useTranslation } from 'react-i18next';
export function useSettingsMutation(
  setSettings: React.Dispatch<React.SetStateAction<Settings | null>>,
  applySettingsToDocument: (newSettings: Settings) => void,
  currentSettings: Settings | null,
) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const calculateHistoryMutation = useCalculateHistoryMutation({
    successTitle: t('Base currency updated successfully.'),
  });

  return useMutation({
    mutationFn: saveSettings,
    onSuccess: (updatedSettings) => {
      setSettings(updatedSettings);
      applySettingsToDocument(updatedSettings);
      queryClient.invalidateQueries({ queryKey: [QueryKeys.SETTINGS] });
      toast({
        title: t('Settings updated successfully.'),
        variant: 'success',
      });
      if (currentSettings?.baseCurrency !== updatedSettings.baseCurrency) {
        calculateHistoryMutation.mutate({
          accountIds: undefined,
          forceFullCalculation: true,
        });
      }
    },
    onError: (error) => {
      logger.error(`Error updating settings: ${error}`);
      toast({
        title: t('Uh oh! Something went wrong.'),
        description: t('There was a problem updating your settings.'),
        variant: 'destructive',
      });
    },
  });
}
