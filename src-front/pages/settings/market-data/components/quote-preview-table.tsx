import type { ImportValidationStatus, QuoteImport } from "@/lib/types/quote-import";
import { Badge } from "@wealthfolio/ui/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@wealthfolio/ui/components/ui/card";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@wealthfolio/ui/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@wealthfolio/ui/components/ui/tooltip";

function formatValidationStatus(status: ImportValidationStatus): string {
  switch (status) {
    case "valid":
      return "Valid";
    case "warning":
      return "Warning";
    case "error":
      return "Error";
    default:
      return status;
  }
}

function getStatusVariant(status: ImportValidationStatus): "success" | "destructive" | "warning" {
  switch (status) {
    case "valid":
      return "success";
    case "warning":
      return "warning";
    case "error":
      return "destructive";
    default:
      return "destructive";
  }
}

interface QuotePreviewTableProps {
  quotes: QuoteImport[];
  maxRows?: number;
}

export function QuotePreviewTable({ quotes, maxRows = 10 }: QuotePreviewTableProps) {
  const displayQuotes = quotes.slice(0, maxRows);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icons.FileText className="h-5 w-5" />
          Preview Data ({quotes.length} rows)
        </CardTitle>
        <CardDescription>Review the first {maxRows} rows of your CSV data</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Symbol</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Open</TableHead>
                <TableHead>High</TableHead>
                <TableHead>Low</TableHead>
                <TableHead>Close</TableHead>
                <TableHead>Volume</TableHead>
                <TableHead>Currency</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TooltipProvider>
                {displayQuotes.map((quote, index) => {
                  const hasError = quote.validationStatus === "error";
                  const hasWarning = quote.validationStatus === "warning";
                  const errorMessage = quote.errorMessage;

                  return (
                    <TableRow
                      key={index}
                      className={
                        hasError
                          ? "bg-destructive/5 hover:bg-destructive/10"
                          : hasWarning
                            ? "bg-warning/5 hover:bg-warning/10"
                            : undefined
                      }
                    >
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-1.5">
                          {errorMessage && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Icons.AlertCircle className="text-destructive h-4 w-4 shrink-0 cursor-help" />
                              </TooltipTrigger>
                              <TooltipContent
                                side="right"
                                className="bg-destructive text-destructive-foreground max-w-xs"
                              >
                                <p>{errorMessage}</p>
                              </TooltipContent>
                            </Tooltip>
                          )}
                          {quote.symbol}
                        </div>
                      </TableCell>
                      <TableCell>{quote.date}</TableCell>
                      <TableCell>{quote.open ?? "-"}</TableCell>
                      <TableCell>{quote.high ?? "-"}</TableCell>
                      <TableCell>{quote.low ?? "-"}</TableCell>
                      <TableCell className="font-medium">{quote.close}</TableCell>
                      <TableCell>{quote.volume ?? "-"}</TableCell>
                      <TableCell>{quote.currency}</TableCell>
                      <TableCell>
                        <Badge
                          variant={getStatusVariant(quote.validationStatus)}
                          className="whitespace-nowrap"
                        >
                          {formatValidationStatus(quote.validationStatus)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TooltipProvider>
            </TableBody>
          </Table>
        </div>
        {quotes.length > maxRows && (
          <p className="text-muted-foreground mt-2 text-sm">
            Showing first {maxRows} of {quotes.length} rows
          </p>
        )}
      </CardContent>
    </Card>
  );
}
