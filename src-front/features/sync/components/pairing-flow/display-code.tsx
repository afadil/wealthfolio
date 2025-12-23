// DisplayCode
// Shows the pairing code for the issuer device
// ============================================

import { useState, useEffect } from "react";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@wealthfolio/ui/components/ui/button";
import { Icons } from "@wealthfolio/ui";

interface DisplayCodeProps {
  code: string;
  expiresAt: Date;
  onCancel: () => void;
}

export function DisplayCode({ code, expiresAt, onCancel }: DisplayCodeProps) {
  const [timeLeft, setTimeLeft] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      if (now >= expiresAt) {
        setTimeLeft("Expired");
      } else {
        setTimeLeft(formatDistanceToNow(expiresAt, { addSuffix: false }));
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Format code with space: "ABC 123"
  const formattedCode = code.length > 3 ? `${code.slice(0, 3)} ${code.slice(3)}` : code;

  return (
    <div className="flex flex-col items-center gap-6 p-6">
      <div className="text-center">
        <h2 className="text-xl font-semibold">Pair New Device</h2>
        <p className="text-muted-foreground mt-1">Enter this code on your new device</p>
      </div>

      <div className="bg-muted relative rounded-lg px-8 py-6">
        <span className="font-mono text-4xl font-bold tracking-widest">{formattedCode}</span>
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-2 right-2 h-8 w-8"
          onClick={handleCopy}
        >
          {copied ? <Icons.Check className="h-4 w-4" /> : <Icons.Copy className="h-4 w-4" />}
        </Button>
      </div>

      <div className="text-muted-foreground text-sm">Expires in {timeLeft}</div>

      <p className="text-muted-foreground max-w-xs text-center text-sm">
        Open Wealthfolio on your new device and select <strong>Pair with existing device</strong>
      </p>

      <Button variant="ghost" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
}
