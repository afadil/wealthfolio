import { useEffect, useState } from 'react';
import { getVersion } from '@tauri-apps/api/app';
import { appDataDir, appLogDir } from '@tauri-apps/api/path';
import { check } from '@tauri-apps/plugin-updater';

import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { SettingsHeader } from '../header';
import { toast } from '@/components/ui/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Icons } from '@/components/ui/icons';

export default function AboutSettingsPage() {
  const [version, setVersion] = useState<string>('');
  const [dbDir, setDbDir] = useState<string>('');
  const [logsDir, setLogsDir] = useState<string>('');

  useEffect(() => {
    // Load version
    getVersion().then(setVersion).catch(() => setVersion('')); // ignore errors

    // Resolve directories (OS-specific via Tauri path API)
    (async () => {
      try {
        const dataDir = await appDataDir();
        setDbDir(dataDir);
      } catch {
        setDbDir('');
      }
      try {
        const logDir = await appLogDir();
        setLogsDir(logDir);
      } catch {
        setLogsDir('');
      }
    })();
  }, []);

  const handleCheckForUpdates = async () => {
    try {
      const update = await check();
      if (update) {
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

  const handleCopy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: 'Copied', description: `${label} copied to clipboard.` });
    } catch (error) {
      toast({
        title: 'Copy failed',
        description: `Could not copy ${label.toLowerCase()}.`,
        variant: 'destructive',
      });
      console.error('Failed to copy to clipboard:', error);
    }
  };

  return (
    <div className="space-y-6">
      <SettingsHeader heading="About" text="Application information" />
      <Separator />

      <Card>
        <CardHeader className="flex flex-row items-center gap-4">
          <img
            src="/logo.svg"
            alt="Wealthfolio logo"
            className="h-12 w-12 rounded-md shadow"
          />
          <div className="flex flex-col">
            <CardTitle className="text-xl">Wealthfolio</CardTitle>
            <CardDescription>
              Version {version || 'N/A'}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={handleCheckForUpdates}>Check for Update</Button>
          </div>

          <Separator />

          <div className="grid gap-4">
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Database directory</p>
              <div className="flex items-center gap-2">
                <p className="truncate rounded-md bg-muted px-3 py-2 font-mono text-xs text-muted-foreground flex-1">
                  {dbDir || 'Unavailable'}
                </p>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={!dbDir}
                  onClick={() => dbDir && handleCopy(dbDir, 'Database directory')}
                >
                  <Icons.Copy className="h-4 w-4" />
                  <span className="sr-only">Copy database directory</span>
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Database file: <span className="font-mono">app.db</span>
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Logs directory</p>
              <div className="flex items-center gap-2">
                <p className="truncate rounded-md bg-muted px-3 py-2 font-mono text-xs text-muted-foreground flex-1">
                  {logsDir || 'Unavailable'}
                </p>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={!logsDir}
                  onClick={() => logsDir && handleCopy(logsDir, 'Logs directory')}
                >
                  <Icons.Copy className="h-4 w-4" />
                  <span className="sr-only">Copy logs directory</span>
                </Button>
              </div>
            </div>
          </div>

          <Separator />

          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              To report an issue, please email <span className="font-mono select-all font-semibold">wealthfolio@teymz.com</span> or create a GitHub issue at{' '}
              <a
                href="https://github.com/afadil/wealthfolio/issues"
                target="_blank"
                rel="noreferrer noopener"
                className="underline underline-offset-4 hover:text-foreground"
              >
                Github Issues
              </a>
              .
            </p>
            <p className="text-sm text-muted-foreground">
              <a
                href="https://wealthfolio.app/legal/privacy-policy"
                target="_blank"
                rel="noreferrer noopener"
                className="underline underline-offset-4 hover:text-foreground"
              >
                Privacy Policy
              </a>
              <span className="mx-2">•</span>
              <a
                href="https://wealthfolio.app/legal/terms-of-use"
                target="_blank"
                rel="noreferrer noopener"
                className="underline underline-offset-4 hover:text-foreground"
              >
                Terms of Use
              </a>
              <span className="mx-2">•</span>
              <a
                href="https://wealthfolio.app/docs/introduction/"
                target="_blank"
                rel="noreferrer noopener"
                className="underline underline-offset-4 hover:text-foreground"
              >
                Docs
              </a>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
