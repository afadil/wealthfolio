import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ContributionLimitForm } from './contribution-limit-form';
import type { ContributionLimits } from '@/lib/types';

interface ContributionLimitEditModalProps {
  limit: ContributionLimits | null;
  open: boolean;
  onClose: () => void;
}

export function ContributionLimitEditModal({
  limit,
  open,
  onClose,
}: ContributionLimitEditModalProps) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <ContributionLimitForm
          defaultValues={limit || undefined}
          onSuccess={() => {
            onClose();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
