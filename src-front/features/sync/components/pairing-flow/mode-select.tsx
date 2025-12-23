// ModeSelect
// Choose between issuer (show code) or claimer (enter code) mode
// ==============================================================

import { Button } from "@wealthfolio/ui/components/ui/button";
import { Card, CardContent } from "@wealthfolio/ui/components/ui/card";
import { Icons } from "@wealthfolio/ui";

interface ModeSelectProps {
  onSelectIssuer: () => void;
  onSelectClaimer: () => void;
  onCancel?: () => void;
}

export function ModeSelect({ onSelectIssuer, onSelectClaimer, onCancel }: ModeSelectProps) {
  return (
    <div className="flex flex-col items-center gap-6 p-6">
      <div className="text-center">
        <h2 className="text-xl font-semibold">Pair Device</h2>
        <p className="text-muted-foreground mt-1">
          Securely connect this device to your existing Wealthfolio setup
        </p>
      </div>

      <div className="grid w-full max-w-md grid-cols-1 gap-4 sm:grid-cols-2">
        <Card
          className="cursor-pointer transition-colors hover:border-primary"
          onClick={onSelectIssuer}
        >
          <CardContent className="flex flex-col items-center gap-3 p-6">
            <Icons.QrCode className="text-primary h-10 w-10" />
            <div className="text-center">
              <h3 className="font-medium">Show Code</h3>
              <p className="text-muted-foreground text-sm">
                I have a trusted device that is already set up
              </p>
            </div>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer transition-colors hover:border-primary"
          onClick={onSelectClaimer}
        >
          <CardContent className="flex flex-col items-center gap-3 p-6">
            <Icons.Keyboard className="text-primary h-10 w-10" />
            <div className="text-center">
              <h3 className="font-medium">Enter Code</h3>
              <p className="text-muted-foreground text-sm">
                I have a code from another device to enter
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {onCancel && (
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      )}
    </div>
  );
}
