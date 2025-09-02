import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@wealthfolio/ui/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@wealthfolio/ui/components/ui/table';
import { Badge } from '@wealthfolio/ui/components/ui/badge';
import { Icons } from '@wealthfolio/ui/components/ui/icons';
import { QuoteImport } from '@/lib/types/quote-import';
import { formatValidationStatus, getStatusColor } from '@/lib/quote-import-utils';

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
              {displayQuotes.map((quote, index) => (
                <TableRow key={index}>
                  <TableCell className="font-medium">{quote.symbol}</TableCell>
                  <TableCell>{quote.date}</TableCell>
                  <TableCell>{quote.open || '-'}</TableCell>
                  <TableCell>{quote.high || '-'}</TableCell>
                  <TableCell>{quote.low || '-'}</TableCell>
                  <TableCell className="font-medium">{quote.close}</TableCell>
                  <TableCell>{quote.volume || '-'}</TableCell>
                  <TableCell>{quote.currency}</TableCell>
                  <TableCell>
                    <Badge
                      variant={quote.validationStatus === 'valid' ? 'default' : 'destructive'}
                      className={getStatusColor(quote.validationStatus)}
                    >
                      {formatValidationStatus(quote.validationStatus)}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {quotes.length > maxRows && (
          <p className="mt-2 text-sm text-muted-foreground">
            Showing first {maxRows} of {quotes.length} rows
          </p>
        )}
      </CardContent>
    </Card>
  );
}
