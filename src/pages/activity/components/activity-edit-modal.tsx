import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ActivityForm } from './activity-form';
import type { AccountSelectOption } from './activity-form';
import type { ActivityDetails } from '@/lib/types';

export interface ActivityEditModalProps {
  accounts: AccountSelectOption[];
  activity?: ActivityDetails;
  open?: boolean;
  onClose?: () => void;
}

export function ActivityEditModal({ accounts, activity, open, onClose }: ActivityEditModalProps) {
  const defaultValues = {
    id: activity?.id || undefined,
    activityDate: activity?.date ? new Date(activity.date) : new Date(),
    fee: activity?.fee || 0,
    isDraft: activity?.isDraft || false,
    quantity: activity?.quantity || 0,
    activityType: (activity?.activityType as any) || '',
    unitPrice: activity?.unitPrice || 0,
    accountId: activity?.accountId || '',
    assetId: activity?.assetId || '',
    comment: activity?.comment || '',
    currency: activity?.currency || '',
    assetDataSource: activity?.assetDataSource || '',
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[625px]">
        <ActivityForm accounts={accounts} defaultValues={defaultValues} onSuccess={onClose} />
      </DialogContent>
    </Dialog>
  );
}
