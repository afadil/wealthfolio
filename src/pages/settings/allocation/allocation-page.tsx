import { Separator } from '@/components/ui/separator';
import { SettingsHeader } from '../settings-header';
import { AllocationForm } from './allocation-form';

export default function SettingsAllocationPage() {
  return (
    <div className="space-y-6">
      <SettingsHeader
        heading="Allocation"
        text="Configure preferences for the allocation and rebalancing features."
      />
      <Separator />
      <AllocationForm />
    </div>
  );
}
