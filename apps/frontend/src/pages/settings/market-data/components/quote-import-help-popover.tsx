import { Button } from "@wealthfolio/ui/components/ui/button";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { Popover, PopoverContent, PopoverTrigger } from "@wealthfolio/ui/components/ui/popover";

export function QuoteImportHelpPopover() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="link" className="flex items-center gap-1 text-sm">
          <Icons.HelpCircle className="mr-1 h-5 w-5" />
          How to Import Quotes?
        </Button>
      </PopoverTrigger>
      <PopoverContent className="m-3 max-h-[min(85vh,680px)] w-[min(90vw,900px)] overflow-y-auto rounded-lg p-4 text-sm sm:m-4 sm:p-6">
        <h4 className="text-lg font-semibold">Importing Historical Quotes</h4>
        <div className="mt-4 grid gap-6 sm:grid-cols-2">
          {/* Left Column - Instructions */}
          <div>
            <p className="text-muted-foreground mt-2 text-sm">
              Import historical market data from CSV files to fill gaps in your portfolio data for
              assets where external data sources only provide recent quotes.
            </p>
            <ol className="mt-3 list-inside list-decimal space-y-1 text-sm">
              <li>Prepare your CSV file with OHLCV data format</li>
              <li>Upload and validate your CSV file</li>
              <li>Review validation results and sample data</li>
              <li>Import quotes with optional duplicate handling</li>
            </ol>
            <div className="mt-4 space-y-3">
              <div className="rounded-md border border-blue-500 bg-blue-50 p-3 dark:border-blue-500/40 dark:bg-blue-900/40">
                <p className="text-sm">
                  <strong className="text-blue-700 dark:text-blue-300">💡 Tip:</strong> Use this
                  feature when external data providers only have quotes from recent years, but you
                  have transaction history from earlier periods.
                </p>
              </div>

              <div className="rounded-md border border-green-500 bg-green-50 p-3 dark:border-green-500/40 dark:bg-green-900/40">
                <p className="text-sm">
                  <strong className="text-green-700 dark:text-green-300">
                    📊 Required fields:
                  </strong>{" "}
                  Only symbol and close price are required. Open, high, low, volume, and currency
                  are optional but recommended for complete data.
                </p>
              </div>

              <div className="rounded-md border border-purple-500 bg-purple-50 p-3 dark:border-purple-500/40 dark:bg-purple-900/40">
                <p className="text-sm">
                  <strong className="text-purple-700 dark:text-purple-300">
                    ⚡ Auto-formatting:
                  </strong>{" "}
                  Multiple date formats are supported (YYYY-MM-DD, DD/MM/YYYY, MM/DD/YYYY). Currency
                  symbols are automatically handled.
                </p>
              </div>
            </div>
          </div>

          {/* Right Column - Examples and Reference */}
          <div>
            <div className="space-y-4">
              <div>
                <p className="font-semibold">Required CSV Format:</p>
                <pre className="bg-muted mt-2 select-all overflow-x-auto rounded-md p-3 text-xs leading-relaxed">
                  <span className="text-muted-foreground">
                    # Required columns: symbol, date, close
                  </span>
                  <br />
                  <span className="text-muted-foreground">
                    # Optional: open, high, low, volume, currency
                  </span>
                  <br />
                  symbol,date,open,high,low,close,volume,currency
                  <br />
                  AAPL,2023-01-03,130.28,130.90,124.17,125.07,112117500,USD
                  <br />
                  MSFT,2023-01-03,243.08,245.75,237.40,239.58,25740000,USD
                  <br />
                  GOOGL,2023-01-03,89.59,91.05,88.52,89.12,28131200,USD
                  <br />
                  <br />
                  <span className="text-muted-foreground">
                    # Alternative date formats supported:
                  </span>
                  <br />
                  AAPL,01/03/2023,130.28,130.90,124.17,125.07,112117500,USD
                  <br />
                  MSFT,3-Jan-2023,243.08,245.75,237.40,239.58,25740000,USD
                </pre>
              </div>

              <div>
                <p className="font-semibold">Data Validation:</p>
                <ul className="mt-2 list-inside list-disc space-y-1 text-sm">
                  <li>
                    <strong>Symbol:</strong> Must be a valid ticker symbol
                  </li>
                  <li>
                    <strong>Date:</strong> Must be a valid date (multiple formats supported)
                  </li>
                  <li>
                    <strong>Prices:</strong> Must be valid decimal numbers
                  </li>
                  <li>
                    <strong>Currency:</strong> 3-letter currency code (defaults to USD)
                  </li>
                  <li>
                    <strong>Duplicates:</strong> Existing quotes can be overwritten or skipped
                  </li>
                </ul>
              </div>

              <div className="rounded-md border border-yellow-500 bg-yellow-50 p-3 dark:border-yellow-500/40 dark:bg-yellow-900/40">
                <p className="text-sm">
                  <strong className="text-yellow-700 dark:text-yellow-300">⚠️ Important:</strong>{" "}
                  Large imports may take time. The system will show progress and handle errors
                  gracefully.
                </p>
              </div>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
