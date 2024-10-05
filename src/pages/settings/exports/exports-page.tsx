import { ExportForm } from './exports-form';
import { SettingsHeader } from '../header';
import { Separator } from '@/components/ui/separator';

const ExportSettingsPage = () => {
  return (
    <div className="space-y-6">
      <SettingsHeader
        heading="Data Export"
        text="Export all your financial data with flexible export options."
      />
      <Separator />
      <ExportForm />
    </div>
  );
};

export default ExportSettingsPage;
