import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { Separator } from "@wealthfolio/ui/components/ui/separator";
import {
  useWealthfolioConnect,
  ConnectedView,
  LoginForm,
} from "@/features/wealthfolio-connect";
import { Card, CardDescription, CardHeader, CardTitle } from "@wealthfolio/ui";
import { SettingsHeader } from "../settings-header";

export default function WealthfolioConnectPage() {
  const { isEnabled, isConnected, isInitializing } = useWealthfolioConnect();

  // Show "not configured" state when Connect feature is disabled
  if (!isEnabled) {
    return (
      <div className="space-y-6">
        <SettingsHeader
          heading="Wealthfolio Connect"
          text="Connect your broker accounts through our cloud service."
        />
        <Separator />
        <Card>
          <CardHeader className="items-center text-center">
            <div className="bg-muted mb-2 flex h-12 w-12 items-center justify-center rounded-full">
              <Icons.Cloud className="text-muted-foreground h-6 w-6" />
            </div>
            <CardTitle>Not Configured</CardTitle>
            <CardDescription>Wealthfolio Connect is not configured for this build.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (isInitializing) {
    return (
      <div className="space-y-6">
        <SettingsHeader
          heading="Wealthfolio Connect"
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
        heading="Wealthfolio Connect"
        text="Connect your broker accounts and devices through our cloud service."
      />
      <Separator />
      {isConnected ? <ConnectedView /> : <LoginForm />}
    </div>
  );
}
