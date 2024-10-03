import { ExportForm } from './exports-form';
import { SettingsHeader } from '../header';
import { Separator } from '@/components/ui/separator';

const ExportPage = () => {
  return (
    <div className="space-y-6">
      <SettingsHeader heading="Export Data" text="Export your data in various formats." />
      <Separator />
      <ExportForm />
    </div>
  );
};

export default ExportPage;
