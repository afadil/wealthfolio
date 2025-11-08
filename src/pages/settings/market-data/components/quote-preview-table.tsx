import { formatValidationStatus } from "@/lib/quote-import-utils";
import { QuoteImport } from "@/lib/types/quote-import";
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
import { useTranslation } from "react-i18next";

interface QuotePreviewTableProps {
  quotes: QuoteImport[];
  maxRows?: number;
}

export function QuotePreviewTable({ quotes, maxRows = 10 }: QuotePreviewTableProps) {
  const { t } = useTranslation("settings");
  const displayQuotes = quotes.slice(0, maxRows);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icons.FileText className="h-5 w-5" />
          {t("quote_preview_title", { count: quotes.length })}
        </CardTitle>
        <CardDescription>{t("quote_preview_description", { count: maxRows })}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("quote_preview_symbol")}</TableHead>
                <TableHead>{t("quote_preview_date")}</TableHead>
                <TableHead>{t("quote_preview_open")}</TableHead>
                <TableHead>{t("quote_preview_high")}</TableHead>
                <TableHead>{t("quote_preview_low")}</TableHead>
                <TableHead>{t("quote_preview_close")}</TableHead>
                <TableHead>{t("quote_preview_volume")}</TableHead>
                <TableHead>{t("quote_preview_currency")}</TableHead>
                <TableHead>{t("quote_preview_status")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayQuotes.map((quote, index) => (
                <TableRow key={index}>
                  <TableCell className="font-medium">{quote.symbol}</TableCell>
                  <TableCell>{quote.date}</TableCell>
                  <TableCell>{quote.open || "-"}</TableCell>
                  <TableCell>{quote.high || "-"}</TableCell>
                  <TableCell>{quote.low || "-"}</TableCell>
                  <TableCell className="font-medium">{quote.close}</TableCell>
                  <TableCell>{quote.volume || "-"}</TableCell>
                  <TableCell>{quote.currency}</TableCell>
                  <TableCell>
                    <Badge
                      variant={quote.validationStatus === "valid" ? "success" : "destructive"}
                      className="whitespace-nowrap"
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
          <p className="text-muted-foreground mt-2 text-sm">
            {t("quote_preview_showing", { max: maxRows, total: quotes.length })}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
