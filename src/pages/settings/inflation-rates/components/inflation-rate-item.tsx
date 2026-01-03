import { InflationRate } from "@/lib/types";
import {
  Button,
  Card,
  CardContent,
  Icons,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Badge,
} from "@wealthfolio/ui";

interface InflationRateItemProps {
  rate: InflationRate;
  onEdit: (rate: InflationRate) => void;
  onDelete: (rate: InflationRate) => void;
}

export function InflationRateItem({ rate, onEdit, onDelete }: InflationRateItemProps) {
  const isPositive = rate.rate > 0;
  const isNegative = rate.rate < 0;

  return (
    <Card className="w-full">
      <CardContent className="flex items-center justify-between p-4">
        <div className="flex items-center gap-4">
          <div className="flex flex-col">
            <span className="text-lg font-semibold">{rate.year}</span>
            <span className="text-muted-foreground text-xs">{rate.countryCode}</span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`text-xl font-bold ${isPositive ? "text-destructive" : isNegative ? "text-success" : ""}`}
            >
              {rate.rate > 0 ? "+" : ""}
              {rate.rate.toFixed(2)}%
            </span>
            <Badge variant={rate.dataSource === "world_bank" ? "secondary" : "outline"}>
              {rate.dataSource === "world_bank" ? "World Bank" : "Manual"}
            </Badge>
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <Icons.MoreVertical className="h-4 w-4" />
              <span className="sr-only">Open menu</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEdit(rate)}>
              <Icons.Pencil className="mr-2 h-4 w-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onDelete(rate)}
              className="text-destructive focus:text-destructive"
            >
              <Icons.Trash className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardContent>
    </Card>
  );
}
