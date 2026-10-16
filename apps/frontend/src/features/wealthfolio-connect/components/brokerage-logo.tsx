import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@wealthfolio/ui/components/ui/avatar";
import type { BrokerConnectionBrokerage } from "../types";

interface BrokerageLogoProps {
  brokerage?: BrokerConnectionBrokerage;
  /** Visible name next to the logo; its first letter is the fallback. */
  name: string;
  className?: string;
}

/** Square logos fill the rounded tile; wide fallbacks sit padded on white so they aren't cropped. */
export function BrokerageLogo({ brokerage, name, className }: BrokerageLogoProps) {
  const squareLogoUrl = brokerage?.aws_s3_square_logo_url;
  return (
    <Avatar className={cn("size-9 shrink-0 rounded-lg", className)}>
      <AvatarImage
        src={squareLogoUrl ?? brokerage?.aws_s3_logo_url}
        alt=""
        className={squareLogoUrl ? "object-cover" : "bg-white object-contain p-1"}
      />
      <AvatarFallback className="rounded-lg text-sm font-semibold">{name.charAt(0)}</AvatarFallback>
    </Avatar>
  );
}
