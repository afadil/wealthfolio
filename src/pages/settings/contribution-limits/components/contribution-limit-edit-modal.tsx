import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ContributionLimitForm } from './contribution-limit-form';
import type { ContributionLimit } from '@/lib/types';

interface ContributionLimitEditModalProps {
  limit: ContributionLimit | null;
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
          defaultValues={
            limit ?? {
              groupName: '',
              contributionYear: new Date().getFullYear(),
              limitAmount: 0,
              accountIds: '',
            }
          }
          onSuccess={() => {
            onClose();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
