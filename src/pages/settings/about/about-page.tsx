import { useEffect, useState } from 'react';
import { getVersion } from '@tauri-apps/api/app';
import { check } from '@tauri-apps/plugin-updater';

import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { SettingsHeader } from '../header';
import { toast } from '@/components/ui/use-toast';

export default function AboutSettingsPage() {
  const [version, setVersion] = useState<string>('');

  useEffect(() => {
    getVersion().then(setVersion).catch(() => setVersion('')); // ignore errors
  }, []);

  const handleCheckForUpdates = async () => {
    try {
      const update = await check();
      if (update?.available) {
        toast({
          title: 'Update available',
          description: `Version ${update.version} is available.`,
        });
      } else {
        toast({ title: 'Up to date', description: 'You have the latest version.' });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to check for updates.',
        variant: 'destructive',
      });
      console.error('Failed to check for updates:', error);
    }
  };

  return (
    <div className="space-y-6">
      <SettingsHeader heading="About" text="Application information" />
      <Separator />
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">Version: {version || 'N/A'}</p>
        <div className="flex flex-col gap-4 sm:flex-row">
          <Button onClick={handleCheckForUpdates}>Check for Update</Button>
          <Button variant="outline" asChild>
            <a href="mailto:wealthfolio@teymz.com">Report an issue</a>
          </Button>
        </div>
      </div>
    </div>
  );
}

