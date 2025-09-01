import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@wealthfolio/ui/components/ui/card';
import { Progress } from '@wealthfolio/ui/components/ui/progress';
import { Badge } from '@wealthfolio/ui/components/ui/badge';
import { Icons } from '@wealthfolio/ui/components/ui/icons';
import { Button } from '@wealthfolio/ui/components/ui/button';

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
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icons.Spinner className={`h-5 w-5 ${isImporting ? 'animate-spin' : ''}`} />
          Import Progress
        </CardTitle>
        <CardDescription>
          {isImporting ? 'Importing quotes...' : 'Import completed'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Progress</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} className="w-full" />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{totalRows}</div>
            <div className="text-sm text-muted-foreground">Total</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{successfulRows}</div>
            <div className="text-sm text-muted-foreground">Successful</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-red-600">{failedRows}</div>
            <div className="text-sm text-muted-foreground">Failed</div>
          </div>
        </div>

        <div className="flex gap-2">
          <Badge variant="outline" className="flex-1 justify-center">
            <Icons.CheckCircle className="mr-1 h-4 w-4" />
            {successfulRows} imported
          </Badge>
          {failedRows > 0 && (
            <Badge variant="destructive" className="flex-1 justify-center">
              <Icons.XCircle className="mr-1 h-4 w-4" />
              {failedRows} failed
            </Badge>
          )}
        </div>

        {isImporting && onCancel && (
          <Button variant="outline" onClick={onCancel} className="w-full">
            <Icons.Close className="mr-2 h-4 w-4" />
            Cancel Import
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
