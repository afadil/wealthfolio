// EnterCode
// Input form for the claimer to enter the pairing code
// =====================================================

import { useState } from "react";
import { Input } from "@wealthfolio/ui/components/ui/input";
import { Button } from "@wealthfolio/ui/components/ui/button";
import { Icons } from "@wealthfolio/ui";

interface EnterCodeProps {
  onSubmit: (code: string) => void;
  onCancel: () => void;
  isLoading?: boolean;
  error?: string | null;
}

export function EnterCode({ onSubmit, onCancel, isLoading, error }: EnterCodeProps) {
  const [code, setCode] = useState("");

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Only allow alphanumeric, auto-uppercase, remove spaces
    const value = e.target.value
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 6);
    setCode(value);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length === 6) {
      onSubmit(code);
    }
  };

  // Format display: "ABC 123"
  const displayCode = code.length > 3 ? `${code.slice(0, 3)} ${code.slice(3)}` : code;

  return (
    <div className="flex flex-col items-center gap-6 p-6">
      <div className="text-center">
        <h2 className="text-xl font-semibold">Enter Pairing Code</h2>
        <p className="text-muted-foreground mt-1">
          Enter the 6-character code shown on your other device
        </p>
      </div>

      <form onSubmit={handleSubmit} className="w-full max-w-xs space-y-4">
        <Input
          value={displayCode}
          onChange={handleChange}
          placeholder="ABC 123"
          className="text-center font-mono text-2xl tracking-widest"
          autoFocus
          disabled={isLoading}
        />

        {error && <p className="text-destructive text-center text-sm">{error}</p>}

        <div className="flex gap-2">
          <Button
            type="button"
            variant="ghost"
            className="flex-1"
            onClick={onCancel}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button type="submit" className="flex-1" disabled={code.length !== 6 || isLoading}>
            {isLoading ? (
              <>
                <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
                Verifying
              </>
            ) : (
              "Continue"
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
