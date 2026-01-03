import { Dialog, DialogContent } from "@wealthfolio/ui";
import { InflationRateForm } from "./inflation-rate-form";
import type { InflationRate } from "@/lib/types";

interface InflationRateEditModalProps {
  rate: InflationRate | null;
  defaultCountryCode?: string;
  open: boolean;
  onClose: () => void;
}

export function InflationRateEditModal({
  rate,
  defaultCountryCode,
  open,
  onClose,
}: InflationRateEditModalProps) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto sm:max-w-lg">
        <InflationRateForm
          defaultValues={
            rate
              ? {
                  id: rate.id,
                  countryCode: rate.countryCode,
                  year: rate.year,
                  rate: rate.rate,
                  referenceDate: rate.referenceDate || "12-31",
                  dataSource: rate.dataSource,
                }
              : undefined
          }
          defaultCountryCode={defaultCountryCode}
          onSuccess={onClose}
        />
      </DialogContent>
    </Dialog>
  );
}
