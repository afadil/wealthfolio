import { Icons } from '@/components/icons';

import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Button } from '@/components/ui/button';

export function ImportHelpHoverCard() {
  return (
    <HoverCard>
      <HoverCardTrigger asChild>
        <Button type="button" variant="link" className="flex items-center">
          <Icons.HelpCircle className="mr-1 h-5 w-5" />
          How to Import CSV
        </Button>
      </HoverCardTrigger>
      <HoverCardContent className="m-4 w-full p-6 text-sm">
        <h4 className="text-lg font-semibold">Importing Account Activities</h4>
        <p className="mt-2 ">
          Follow these steps to import your account activities from a CSV file:
        </p>
        <ul className="mt-2 list-inside list-disc space-y-1 ">
          <li>Ensure your CSV file is in the correct format.</li>
          <li>
            Columns should include Date, Symbol, Quantity, Activity Type, Unit Price, Currency, and
            Fee.
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
            <li>TRANSFER_IN</li>
            <li>TRANSFER_OUT</li>
            <li>CONVERSION_IN</li>
            <li>CONVERSION_OUT</li>
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
        </pre>
      </HoverCardContent>
    </HoverCard>
  );
}
