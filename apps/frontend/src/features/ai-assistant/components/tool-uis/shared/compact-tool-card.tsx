import { Icons } from "@wealthfolio/ui/components/ui/icons";

export interface CompactToolCardProps {
  icon?: React.ReactNode;
  label: string;
}

export function CompactToolCard({ icon, label }: CompactToolCardProps) {
  return (
    <div className="text-muted-foreground flex items-center gap-2 py-1 text-xs">
      {icon ?? <Icons.Check className="text-success h-3.5 w-3.5 shrink-0" />}
      <span>{label}</span>
    </div>
  );
}
