import { Icons } from "@/components/ui/icons";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { usePlatform } from "@/hooks/use-platform";
import {
  ScrollArea,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@wealthfolio/ui";

export function ImportHelpPopover() {
  const { isMobile } = usePlatform();

  const helpContent = (
    <div className="space-y-4">
      <div>
        <h4 className="text-lg font-semibold">Importing Account Activities</h4>
        <p className="text-muted-foreground mt-2 text-sm">
          Import your account activities from CSV files with automatic data normalization and
          flexible column mapping.
        </p>
      </div>

      <div>
        <p className="font-semibold">Steps:</p>
        <ol className="mt-2 list-inside list-decimal space-y-1 text-sm">
          <li>Ensure your CSV has headers with the required fields</li>
          <li>Select account and upload your CSV file</li>
          <li>
            Map CSV columns to required fields:
            <span className="text-muted-foreground ml-2 text-xs">
              date, symbol, quantity, activityType, unitPrice, currency, fee, amount
            </span>
          </li>
          <li>Map activity types and symbols if needed</li>
          <li>Preview, verify, and import your activities</li>
        </ol>
      </div>

      <div className="space-y-3">
        <div className="border-blue-500 bg-blue-50 p-3 dark:bg-blue-900/50">
          <p className="text-sm">
            <strong className="text-blue-700 dark:text-blue-300">💡 Tip:</strong> Column names and
            activity types don&apos;t need to match exactly - you can map them during import.
            Mappings are saved for future imports.
          </p>
        </div>

        <div className="border-green-500 bg-green-50 p-3 dark:bg-green-900/50">
          <p className="text-sm">
            <strong className="text-green-700 dark:text-green-300">💰 Amount field:</strong> For
            cash activities (DIVIDEND, DEPOSIT, WITHDRAWAL, TAX, FEE, INTEREST, TRANSFER_IN,
            TRANSFER_OUT), amount is preferred when provided, otherwise calculated from quantity ×
            unitPrice.
          </p>
        </div>

        <div className="border-purple-500 bg-purple-50 p-3 dark:bg-purple-900/50">
          <p className="text-sm">
            <strong className="text-purple-700 dark:text-purple-300">⚡ Auto-formatting:</strong>{" "}
            Negative values, currency symbols ($, £, €), commas, and parentheses are automatically
            handled. No manual data cleanup needed.
          </p>
        </div>
      </div>

      <div>
        <p className="font-semibold">Supported Activity Types:</p>
        <pre className="bg-muted mt-2 overflow-x-auto p-4 text-xs">
          <ul className="list-inside list-disc space-y-1">
            <li>BUY</li>
            <li>SELL</li>
            <li>DIVIDEND</li>
            <li>INTEREST</li>
            <li>DEPOSIT</li>
            <li>WITHDRAWAL</li>
            <li>ADD_HOLDING (Increases quantity, cash not impacted)</li>
            <li>REMOVE_HOLDING (Decreases quantity, cash not impacted)</li>
            <li>TRANSFER_IN (Increases cash)</li>
            <li>TRANSFER_OUT (Decreases cash)</li>
            <li>FEE</li>
            <li>TAX</li>
            <li>SPLIT (Adjusts quantity & unit cost, no cash impact)</li>
          </ul>
        </pre>
      </div>

      <div>
        <p className="font-semibold">Example CSV format:</p>
        <pre className="bg-muted mt-2 overflow-x-auto p-3 text-xs leading-relaxed select-all">
          <span className="text-muted-foreground"># Standard format:</span>
          <br />
          date,symbol,quantity,activityType,unitPrice,currency,fee,amount
          <br />
          2024-01-01,MSFT,1,DIVIDEND,57.5,USD,0,57.5
          <br />
          2023-12-15,MSFT,30,BUY,368.60,USD,0
          <br />
          2023-08-11,$CASH-USD,1,DEPOSIT,1,USD,0,600.03
          <br />
          <br />
          <span className="text-muted-foreground"># With currency symbols (auto-parsed):</span>
          <br />
          06/27/2025,AAPL,25,SELL,$48.95,USD,,$1223.63
          <br />
          06/20/2025,AAPL,8,BUY,$86.56,USD,,-$692.48
        </pre>
      </div>

      <p className="text-xs">
        For more details, see the{" "}
        <a
          href="https://wealthfolio.app/docs/concepts/activity-types"
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          Activity Reference documentation
        </a>
        .
      </p>
    </div>
  );

  if (isMobile) {
    return (
      <Sheet>
        <SheetTrigger asChild>
          <Button type="button" variant="ghost" size="icon" className="h-9 w-9">
            <Icons.HelpCircle className="h-6 w-6" />
          </Button>
        </SheetTrigger>
        <SheetContent side="bottom" className="h-[85vh]">
          <SheetHeader>
            <SheetTitle>How to Import CSV</SheetTitle>
          </SheetHeader>
          <ScrollArea className="h-[calc(85vh-4rem)] pr-4">{helpContent}</ScrollArea>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="link" className="flex items-center">
          <Icons.HelpCircle className="mr-1 h-5 w-5" />
          How to Import CSV?
        </Button>
      </PopoverTrigger>
      <PopoverContent className="m-4 w-[900px] max-w-[calc(100vw-2rem)] p-6 text-sm">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">{helpContent}</div>
      </PopoverContent>
    </Popover>
  );
}
