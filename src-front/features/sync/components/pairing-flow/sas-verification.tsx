// SASVerification
// Shows the Short Authentication String for verification
// ======================================================

import { Button } from "@wealthfolio/ui/components/ui/button";
import { Icons } from "@wealthfolio/ui";
import type { PairingRole } from "../../types";

interface SASVerificationProps {
  sas: string;
  role: PairingRole;
  onConfirm?: () => void;
  onReject?: () => void;
  isLoading?: boolean;
}

export function SASVerification({
  sas,
  role,
  onConfirm,
  onReject,
  isLoading,
}: SASVerificationProps) {
  // Format SAS: "123 456"
  const formattedSAS = sas.length > 3 ? `${sas.slice(0, 3)} ${sas.slice(3)}` : sas;

  return (
    <div className="flex flex-col items-center gap-6 p-6">
      <div className="text-center">
        <h2 className="text-xl font-semibold">Verify Security Code</h2>
        <p className="text-muted-foreground mt-1">
          Confirm this number matches on your {role === "issuer" ? "new device" : "other device"}
        </p>
      </div>

      <div className="bg-muted rounded-lg px-8 py-6">
        <span className="font-mono text-4xl font-bold tracking-widest">{formattedSAS}</span>
      </div>

      {role === "issuer" ? (
        <div className="flex gap-3">
          <Button variant="destructive" onClick={onReject} disabled={isLoading} className="gap-2">
            <Icons.ShieldX className="h-4 w-4" />
            Don't Match
          </Button>
          <Button onClick={onConfirm} disabled={isLoading} className="gap-2">
            {isLoading ? (
              <Icons.Spinner className="h-4 w-4 animate-spin" />
            ) : (
              <Icons.ShieldCheck className="h-4 w-4" />
            )}
            Numbers Match
          </Button>
        </div>
      ) : (
        <div className="text-muted-foreground flex items-center gap-2">
          <Icons.Spinner className="h-4 w-4 animate-spin" />
          Waiting for confirmation on other device...
        </div>
      )}
    </div>
  );
}
