import { Icons } from "@/components/ui/icons";
import { Separator } from "@/components/ui/separator";
import { useWealthfolioSync } from "@/context/wealthfolio-sync-context";
import { SettingsHeader } from "../settings-header";
import { SyncLoginForm } from "./sync-login-form";
import { SyncConnectedView } from "./sync-connected-view";

export default function WealthfolioSyncPage() {
  const { isConnected, isLoading } = useWealthfolioSync();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <SettingsHeader
          heading="Wealthfolio Sync"
          text="Connect your broker accounts through our cloud service."
        />
        <Separator />
        <div className="flex items-center justify-center py-12">
          <Icons.Spinner className="text-muted-foreground h-8 w-8 animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SettingsHeader
        heading="Wealthfolio Sync"
        text="Connect your broker accounts through our cloud service."
      />
      <Separator />
      {isConnected ? <SyncConnectedView /> : <SyncLoginForm />}
    </div>
  );
}
