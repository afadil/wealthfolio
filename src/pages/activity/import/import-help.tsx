import { Icons } from '@/components/icons';

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
      <PopoverContent className="m-4 w-full p-6 text-sm">
        <h4 className="text-lg font-semibold">Importing Account Activities</h4>
        <p className="mt-2">
          Follow these steps to import your account activities from a CSV file:
        </p>
        <ul className="mt-2 list-inside list-disc space-y-1">
          <li>Ensure your CSV file is in the correct format.</li>
          <li>
            Columns should include <strong>date</strong>, <strong>symbol</strong>,{' '}
            <strong>quantity</strong>, <strong>activityType</strong>, <strong>unitPrice</strong>,{' '}
            <strong>currency</strong>, <strong>fee</strong>
          </li>
          <li>Click the 'Import' button and select your CSV file.</li>
          <li>Review the imported activities before confirming.</li>
        </ul>
        <p className="mt-2 font-semibold">Supported Activity Types:</p>
        <pre className="mt-2 overflow-x-auto bg-muted p-4 text-sm">
          <ul className="list-inside list-disc space-y-1 text-sm">
            <li>BUY</li>
            <li>SELL</li>
            <li>DIVIDEND</li>
            <li>INTEREST</li>
            <li>DEPOSIT</li>
            <li>WITHDRAWAL</li>
            <li>TRANSFER_IN (same as deposit)</li>
            <li>TRANSFER_OUT (same as withdrawal)</li>
            <li>CONVERSION_IN (same as deposit)</li>
            <li>CONVERSION_OUT (same as withdrawal)</li>
            <li>FEE</li>
            <li>TAX</li>
          </ul>
        </pre>
        <p className="mt-2 font-semibold">Example CSV format:</p>
        <pre className="mt-2 overflow-x-auto bg-muted p-4 text-sm">
          date,symbol,quantity,activityType,unitPrice,currency,fee
          <br />
          2024-01-01T15:02:36.329Z,MSFT,1,DIVIDEND,57.5,USD,0
          <br />
          2023-12-15T15:02:36.329Z,MSFT,30,BUY,368.6046511627907,USD,0
          <br />
          2023-08-11T14:55:30.863Z,$CASH-USD,600.03,DEPOSIT,1,USD,0
          <br />
          2023-06-05T09:15:22.456Z,$CASH-USD,1,INTEREST,180.5,USD,0
          <br />
          2023-05-18T13:45:30.789Z,GOOGL,5,SELL,2500.75,USD,10
          <br />
          2023-04-02T11:20:15.321Z,$CASH-USD,1000,WITHDRAWAL,1,USD,0
        </pre>
      </PopoverContent>
    </Popover>
  );
}
