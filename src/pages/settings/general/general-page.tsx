import { Separator } from '@/components/ui/separator';
import { GeneralSettingForm } from './general-form';
import { SettingsHeader } from '../header';

export default function GeneralSettingsPage() {
  return (
    <div className="space-y-6">
      <SettingsHeader
        heading="General"
        text="Manage the general application settings and preferences."
      />
      <Separator />
      <GeneralSettingForm />
    </div>
  );
}
