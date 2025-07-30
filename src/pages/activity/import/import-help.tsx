import { Icons } from '@/components/ui/icons';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';

export function ImportHelpPopover() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="link" className="flex items-center">
          <Icons.HelpCircle className="mr-1 h-5 w-5" />
          How to Import CSV?
        </Button>
      </PopoverTrigger>
      <PopoverContent className="m-4 w-[900px] p-6 text-sm">
        <h4 className="text-lg font-semibold">Importing Account Activities</h4>
        <div className="mt-4 grid grid-cols-2 gap-6">
          {/* Left Column - Instructions */}
          <div>
            <p className="mt-2">
              Follow these steps to import your account activities from a CSV file:
            </p>
            <ol className="mt-2 list-inside list-decimal space-y-1">
              <li>
                Make sure the first line of your CSV file is the header and contains all the
                required fields
              </li>
              <li>
                Select an account and drop your CSV file in the upload area or click to select it
              </li>
              <li>
                Map your CSV columns to the required fields:
                <ul className="ml-6 mt-1 list-inside list-disc space-y-1">
                  <li>
                    <strong>date</strong> - Transaction date
                  </li>
                  <li>
                    <strong>symbol</strong> - Stock/Asset symbol
                  </li>
                  <li>
                    <strong>quantity</strong> - Number of units
                  </li>
                  <li>
                    <strong>activityType</strong> - Type of transaction
                  </li>
                  <li>
                    <strong>unitPrice</strong> - Price per unit
                  </li>
                  <li>
                    <strong>currency</strong> - Transaction currency
                  </li>
                  <li>
                    <strong>fee</strong> - Transaction fee (optional)
                  </li>
                  <li>
                    <strong>amount</strong> - Total amount (mandatory for cash activities)
                  </li>
                </ul>
              </li>
              <li>Map your activity types to our supported types</li>
              <li>Map your stock symbols if needed</li>
              <li>Preview and verify the mapped data</li>
              <li>Click Import to confirm and save your activities</li>
            </ol>
            <div className="mt-4 space-y-2">
              <p>
                <strong>Note:</strong> Don't worry if your CSV columns have different names or your
                activity types don't match exactly - you'll be able to map them during the import
                process. The mapping is saved for future imports for this account.
              </p>
              <p>
                <strong>About the amount field:</strong> For cash activities (DIVIDEND, DEPOSIT,
                WITHDRAWAL, TAX, FEE, INTEREST, TRANSFER_IN, TRANSFER_OUT), the amount is mandatory,
                and quantity/unitPrice are ignored.
              </p>
            </div>
          </div>

          {/* Right Column - Examples and Reference */}
          <div>
            <div className="space-y-4">
              <div>
                <p className="font-semibold">Supported Activity Types:</p>
                <pre className="mt-2 overflow-x-auto bg-muted p-4 text-xs">
                  <ul className="list-inside list-disc space-y-1">
                    <li>BUY</li>
                    <li>SELL</li>
                    <li>DIVIDEND</li>
                    <li>INTEREST</li>
                    <li>DEPOSIT</li>
                    <li>WITHDRAWAL</li>
                    <li>ADD_HOLDING (Increases quantity, fee may apply)</li>
                    <li>REMOVE_HOLDING (Decreases quantity, fee may apply)</li>
                    <li>TRANSFER_IN (Increases cash or asset quantity)</li>
                    <li>TRANSFER_OUT (Decreases cash or asset quantity)</li>
                    <li>FEE</li>
                    <li>TAX</li>
                    <li>SPLIT (Adjusts quantity & unit cost, no cash impact)</li>
                  </ul>
                </pre>
              </div>

              <div>
                <p className="font-semibold">Example CSV format:</p>
                <pre className="mt-2 overflow-x-auto bg-muted p-4 text-xs">
                  date,symbol,quantity,activityType,unitPrice,currency,fee,amount
                  <br />
                  2024-01-01T15:02:36.329Z,MSFT,1,DIVIDEND,57.5,USD,0,57.5
                  <br />
                  2023-12-15T15:02:36.329Z,MSFT,30,BUY,368.60,USD,0
                  <br />
                  2023-08-11T14:55:30.863Z,$CASH-USD,1,DEPOSIT,1,USD,0,600.03
                  <br />
                  2023-06-05T09:15:22.456Z,$CASH-USD,1,INTEREST,180.5,USD,0,180.5
                  <br />
                  2023-05-18T13:45:30.789Z,GOOGL,5,SELL,2500.75,USD,10
                  <br />
                  2023-04-02T11:20:15.321Z,$CASH-USD,1,WITHDRAWAL,1,USD,0,1000
                </pre>
              </div>
              <p className="mt-2 text-xs">
                For more details, see the{' '}
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
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
