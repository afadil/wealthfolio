import { formatValidationStatus } from "@/lib/quote-import-utils";
import { QuoteImport } from "@/lib/types/quote-import";
import { Badge } from "@wealthvn/ui/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@wealthvn/ui/components/ui/card";
import { Icons } from "@wealthvn/ui/components/ui/icons";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@wealthvn/ui/components/ui/table";
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
          {t("marketData.import.preview.title", { count: quotes.length })}
        </CardTitle>
        <CardDescription>{t("marketData.import.preview.description", { maxRows })}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("marketData.import.preview.columns.symbol")}</TableHead>
                <TableHead>{t("marketData.import.preview.columns.date")}</TableHead>
                <TableHead>{t("marketData.import.preview.columns.open")}</TableHead>
                <TableHead>{t("marketData.import.preview.columns.high")}</TableHead>
                <TableHead>{t("marketData.import.preview.columns.low")}</TableHead>
                <TableHead>{t("marketData.import.preview.columns.close")}</TableHead>
                <TableHead>{t("marketData.import.preview.columns.volume")}</TableHead>
                <TableHead>{t("marketData.import.preview.columns.currency")}</TableHead>
                <TableHead>{t("marketData.import.preview.columns.status")}</TableHead>
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
            {t("marketData.import.preview.showing", { shown: maxRows, total: quotes.length })}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
