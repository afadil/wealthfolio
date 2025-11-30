import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@wealthvn/ui/components/ui/card";
import { Progress } from "@wealthvn/ui/components/ui/progress";
import { Badge } from "@wealthvn/ui/components/ui/badge";
import { Icons } from "@wealthvn/ui/components/ui/icons";
import { Button } from "@wealthvn/ui/components/ui/button";
import { useTranslation } from "react-i18next";

interface QuoteImportProgressProps {
  isImporting: boolean;
  progress: number;
  totalRows: number;
  successfulRows: number;
  failedRows: number;
  onCancel?: () => void;
}

export function QuoteImportProgress({
  isImporting,
  progress,
  totalRows,
  successfulRows,
  failedRows,
  onCancel,
}: QuoteImportProgressProps) {
  const { t } = useTranslation("settings");

  // If not importing, show 100% progress (import completed)
  const displayProgress = isImporting ? progress : 100;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icons.Spinner className={`h-5 w-5 ${isImporting ? "animate-spin" : ""}`} />
          {t("marketData.import.progress.title")}
        </CardTitle>
        <CardDescription>
          {isImporting
            ? t("marketData.import.progress.importing")
            : t("marketData.import.progress.completed")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>{t("marketData.import.progress.progressLabel")}</span>
            <span>{Math.round(displayProgress)}%</span>
          </div>
          <Progress value={displayProgress} className="w-full" />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{totalRows}</div>
            <div className="text-muted-foreground text-sm">
              {t("marketData.import.progress.total")}
            </div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{successfulRows}</div>
            <div className="text-muted-foreground text-sm">
              {t("marketData.import.progress.successful")}
            </div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-red-600">{failedRows}</div>
            <div className="text-muted-foreground text-sm">
              {t("marketData.import.progress.failed")}
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <Badge variant="outline" className="flex-1 justify-center">
            <Icons.CheckCircle className="mr-1 h-4 w-4" />
            {t("marketData.import.progress.imported", { count: successfulRows })}
          </Badge>
          {failedRows > 0 && (
            <Badge variant="destructive" className="flex-1 justify-center">
              <Icons.XCircle className="mr-1 h-4 w-4" />
              {t("marketData.import.progress.failedCount", { count: failedRows })}
            </Badge>
          )}
        </div>

        {isImporting && onCancel && (
          <Button variant="outline" onClick={onCancel} className="w-full">
            <Icons.Close className="mr-2 h-4 w-4" />
            {t("marketData.import.progress.cancelButton")}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
