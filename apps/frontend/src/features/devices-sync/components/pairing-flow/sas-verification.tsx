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
  const formattedSAS = sas.length > 3 ? `${sas.slice(0, 3)} ${sas.slice(3)}` : sas;

  return (
    <div className="flex flex-col items-center gap-5 py-10">
      <div className="bg-muted rounded-xl px-8 py-5">
        <span className="font-mono text-4xl font-bold tracking-widest">{formattedSAS}</span>
      </div>

      <p className="text-muted-foreground text-sm">Same code on both devices?</p>

      {role === "issuer" ? (
        <div className="flex gap-3">
          <Button variant="outline" onClick={onReject} disabled={isLoading}>
            No
          </Button>
          <Button onClick={onConfirm} disabled={isLoading}>
            {isLoading ? <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" /> : null}
            Yes
          </Button>
        </div>
      ) : (
        <div className="text-muted-foreground flex items-center gap-2 text-sm">
          <Icons.Spinner className="h-4 w-4 animate-spin" />
          Waiting for approval...
        </div>
      )}
    </div>
  );
}
