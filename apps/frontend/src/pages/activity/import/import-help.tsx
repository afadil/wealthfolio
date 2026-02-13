import { Icons } from "@wealthfolio/ui/components/ui/icons";

import { Button } from "@wealthfolio/ui/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@wealthfolio/ui/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@wealthfolio/ui/components/ui/tabs";
import { usePlatform } from "@/hooks/use-platform";
import {
  ScrollArea,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@wealthfolio/ui";
import { downloadSampleCsv, downloadSampleHoldingsCsv } from "./utils/sample-csv";

// ─────────────────────────────────────────────────────────────────────────────
// Activities Help Content
// ─────────────────────────────────────────────────────────────────────────────

function ActivitiesHelpContent() {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
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
                date, symbol, quantity, activityType, unitPrice, currency, fee, amount, fxRate,
                subtype
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

      <div className="space-y-4">
        <div>
          <p className="font-semibold">Example CSV format:</p>
          <pre className="bg-muted mt-2 select-all overflow-x-auto p-3 text-xs leading-relaxed">
            <span className="text-muted-foreground"># Standard format:</span>
            <br />
            date,symbol,quantity,activityType,unitPrice,currency,fee,amount,fxRate,subtype
            <br />
            2024-01-01,MSFT,1,DIVIDEND,57.5,USD,0,57.5,,DRIP
            <br />
            2023-12-15,MSFT,30,BUY,368.60,USD,0,,,
            <br />
            2023-08-11,,1,DEPOSIT,1,USD,0,600.03,,
            <br />
            2024-02-01,AAPL,10,BUY,185.50,CAD,5,,1.35,
            <br />
            <br />
            <span className="text-muted-foreground"># With currency symbols (auto-parsed):</span>
            <br />
            06/27/2025,AAPL,25,SELL,$48.95,USD,,$1223.63,,
            <br />
            06/20/2025,AAPL,8,BUY,$86.56,USD,,-$692.48,,
          </pre>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3 flex items-center gap-1.5"
            onClick={downloadSampleCsv}
          >
            <Icons.Download className="h-4 w-4" />
            Download Sample CSV
          </Button>
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
              <li>TRANSFER_IN (Moves cash/assets in)</li>
              <li>TRANSFER_OUT (Moves cash/assets out)</li>
              <li>FEE</li>
              <li>TAX</li>
              <li>SPLIT (Adjusts quantity & unit cost, no cash impact)</li>
              <li>CREDIT (Cash credits: refunds, rebates, bonuses)</li>
              <li>ADJUSTMENT (Non-trade corrections)</li>
            </ul>
          </pre>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Holdings Help Content
// ─────────────────────────────────────────────────────────────────────────────

function HoldingsHelpContent() {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="space-y-4">
        <div>
          <h4 className="text-lg font-semibold">Importing Holdings Snapshots</h4>
          <p className="text-muted-foreground mt-2 text-sm">
            Import point-in-time snapshots of your portfolio holdings. Each row represents a
            position held on a specific date.
          </p>
        </div>

        <div>
          <p className="font-semibold">Steps:</p>
          <ol className="mt-2 list-inside list-decimal space-y-1 text-sm">
            <li>Ensure your CSV has headers with the required fields</li>
            <li>Select account and upload your CSV file</li>
            <li>
              Map CSV columns to fields:
              <span className="text-muted-foreground ml-2 text-xs">
                date, symbol, quantity, avgCost, currency
              </span>
            </li>
            <li>Review grouped snapshots and import</li>
          </ol>
        </div>

        <div>
          <p className="font-semibold">Required fields:</p>
          <ul className="mt-2 list-inside list-disc space-y-1 text-sm">
            <li>
              <strong>date</strong> — snapshot date (YYYY-MM-DD)
            </li>
            <li>
              <strong>symbol</strong> — ticker symbol (e.g. AAPL, MSFT)
            </li>
            <li>
              <strong>quantity</strong> — number of shares held
            </li>
          </ul>
          <p className="mt-3 font-semibold">Optional fields:</p>
          <ul className="mt-2 list-inside list-disc space-y-1 text-sm">
            <li>
              <strong>avgCost</strong> — average cost per share
            </li>
            <li>
              <strong>currency</strong> — currency code (defaults to account currency)
            </li>
          </ul>
        </div>

        <div className="space-y-3">
          <div className="border-blue-500 bg-blue-50 p-3 dark:bg-blue-900/50">
            <p className="text-sm">
              <strong className="text-blue-700 dark:text-blue-300">💡 Tip:</strong> Column names are
              auto-detected (e.g. &quot;ticker&quot; maps to symbol, &quot;shares&quot; maps to
              quantity). You can adjust mappings during import.
            </p>
          </div>

          <div className="border-green-500 bg-green-50 p-3 dark:bg-green-900/50">
            <p className="text-sm">
              <strong className="text-green-700 dark:text-green-300">💰 Cash balances:</strong> Use{" "}
              <code className="bg-muted rounded px-1">$CASH</code> as the symbol to import cash
              balances. The quantity represents the cash amount.
            </p>
          </div>

          <div className="border-purple-500 bg-purple-50 p-3 dark:bg-purple-900/50">
            <p className="text-sm">
              <strong className="text-purple-700 dark:text-purple-300">⚡ Snapshots:</strong> Rows
              with the same date are grouped into a single snapshot. Multiple snapshots across
              different dates can be imported at once.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <p className="font-semibold">Example CSV format:</p>
          <pre className="bg-muted mt-2 select-all overflow-x-auto p-3 text-xs leading-relaxed">
            <span className="text-muted-foreground"># Holdings snapshot:</span>
            <br />
            date,symbol,quantity,avgCost,currency
            <br />
            2024-03-31,AAPL,50,171.48,USD
            <br />
            2024-03-31,MSFT,30,420.72,USD
            <br />
            2024-03-31,VOO,20,468.50,USD
            <br />
            2024-03-31,$CASH,5000,,USD
            <br />
            <br />
            <span className="text-muted-foreground"># Multiple snapshot dates:</span>
            <br />
            2024-06-30,AAPL,55,210.62,USD
            <br />
            2024-06-30,MSFT,30,446.34,USD
            <br />
            2024-06-30,VOO,25,495.89,USD
            <br />
            2024-06-30,$CASH,3200,,USD
          </pre>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3 flex items-center gap-1.5"
            onClick={downloadSampleHoldingsCsv}
          >
            <Icons.Download className="h-4 w-4" />
            Download Sample CSV
          </Button>
        </div>

        <div>
          <p className="font-semibold">Supported date formats:</p>
          <pre className="bg-muted mt-2 overflow-x-auto p-4 text-xs">
            <ul className="list-inside list-disc space-y-1">
              <li>YYYY-MM-DD (2024-03-31)</li>
              <li>MM/DD/YYYY (03/31/2024)</li>
              <li>DD/MM/YYYY (31/03/2024)</li>
              <li>MM-DD-YYYY (03-31-2024)</li>
              <li>DD-MM-YYYY (31-03-2024)</li>
            </ul>
          </pre>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Import Help Popover
// ─────────────────────────────────────────────────────────────────────────────

interface ImportHelpPopoverProps {
  defaultTab?: "activities" | "holdings";
}

export function ImportHelpPopover({ defaultTab = "activities" }: ImportHelpPopoverProps) {
  const { isMobile } = usePlatform();

  const helpContent = (
    <Tabs defaultValue={defaultTab}>
      <TabsList className="mb-4 w-auto">
        <TabsTrigger value="activities">Activities</TabsTrigger>
        <TabsTrigger value="holdings">Holdings</TabsTrigger>
      </TabsList>
      <TabsContent value="activities" className="m-0">
        <ActivitiesHelpContent />
      </TabsContent>
      <TabsContent value="holdings" className="m-0">
        <HoldingsHelpContent />
      </TabsContent>
    </Tabs>
  );

  if (isMobile) {
    return (
      <Sheet>
        <SheetTrigger asChild>
          <Button type="button" variant="ghost" size="icon" className="h-9 w-9">
            <Icons.HelpCircle className="h-6 w-6" />
          </Button>
        </SheetTrigger>
        <SheetContent side="bottom" className="rounded-t-4xl mx-1 h-[85vh]">
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
      <PopoverContent className="m-4 max-h-[80vh] w-[900px] max-w-[calc(100vw-2rem)] overflow-y-auto p-6 text-sm">
        {helpContent}
      </PopoverContent>
    </Popover>
  );
}
