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

export function SASVerification({ sas, role, onConfirm, onReject, isLoading }: SASVerificationProps) {
  const formattedSAS = sas.length > 3 ? `${sas.slice(0, 3)} ${sas.slice(3)}` : sas;

  return (
    <div className="flex flex-col items-center gap-4">
      <p className="text-muted-foreground text-center text-sm">
        Verify this code matches on both devices
      </p>

      <div className="bg-muted rounded-lg px-6 py-4">
        <span className="font-mono text-3xl font-bold tracking-widest">{formattedSAS}</span>
      </div>

      {role === "issuer" ? (
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onReject} disabled={isLoading}>
            No Match
          </Button>
          <Button size="sm" onClick={onConfirm} disabled={isLoading}>
            {isLoading ? <Icons.Spinner className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            Confirm
          </Button>
        </div>
      ) : (
        <div className="text-muted-foreground flex items-center gap-2 text-sm">
          <Icons.Spinner className="h-4 w-4 animate-spin" />
          Waiting for other device...
        </div>
      )}
    </div>
  );
}
