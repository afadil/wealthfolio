import { formatQuantity } from "../../lib/utils";

interface QuantityDisplayProps {
  value: number;
  isHidden: boolean;
}

export function QuantityDisplay({ value, isHidden }: QuantityDisplayProps) {
  return <span>{isHidden ? "••••" : formatQuantity(value)}</span>;
}
