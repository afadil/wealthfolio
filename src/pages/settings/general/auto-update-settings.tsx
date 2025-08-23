import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useSettingsContext } from '@/lib/settings-provider';
import { updateSettings } from '@/commands/settings';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { QueryKeys } from '@/lib/query-keys';
import { toast } from '@/components/ui/use-toast';

export function AutoUpdateSettings() {
  const { settings } = useSettingsContext();
  const queryClient = useQueryClient();

  const updateSettingsMutation = useMutation({
    mutationFn: updateSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QueryKeys.SETTINGS] });
      toast({
        title: 'Settings updated',
        description: 'Auto-update settings have been saved successfully.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: 'Failed to update auto-update settings. Please try again.',
        variant: 'destructive',
      });
      console.error('Failed to update settings:', error);
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
        <CardTitle className='text-lg'>Automatic Updates</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="auto-update-check" className="text-base">
              Enable automatic update checks
            </Label>
            <p className="text-xs text-muted-foreground">
              When enabled, Wealthfolio will automatically check for updates when the application starts.
              You can still manually check for updates from the Help menu.
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
