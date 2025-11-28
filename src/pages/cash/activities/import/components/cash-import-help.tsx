import { Button } from "@/components/ui/button";
import { Icons } from "@/components/ui/icons";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function CashImportHelpPopover() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <Icons.HelpCircle className="h-4 w-4" />
          <span className="sr-only">Help</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <div className="space-y-4">
          <div>
            <h4 className="font-semibold">Importing Cash Activities</h4>
            <p className="text-muted-foreground text-sm">
              Import your bank or cash transactions from a CSV file.
            </p>
          </div>

          <div className="space-y-3">
            <div>
              <h5 className="text-sm font-medium">Required Columns</h5>
              <ul className="text-muted-foreground mt-1 list-inside list-disc text-sm">
                <li>
                  <strong>Date</strong> - Transaction date
                </li>
                <li>
                  <strong>Amount</strong> - Transaction amount (positive = deposit, negative =
                  withdrawal)
                </li>
              </ul>
            </div>

            <div>
              <h5 className="text-sm font-medium">Optional Columns</h5>
              <ul className="text-muted-foreground mt-1 list-inside list-disc text-sm">
                <li>
                  <strong>Name/Description</strong> - Merchant or description
                </li>
                <li>
                  <strong>Activity Type</strong> - Transaction type
                </li>
                <li>
                  <strong>Notes</strong> - Additional notes
                </li>
              </ul>
            </div>

            <div>
              <h5 className="text-sm font-medium">Amount Sign</h5>
              <p className="text-muted-foreground text-sm">
                By default, positive amounts are deposits and negative amounts are withdrawals. You
                can invert this in the mapping step if your bank uses the opposite convention.
              </p>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
