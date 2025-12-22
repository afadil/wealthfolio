import { Separator } from "@/components/ui/separator";
import { SettingsHeader } from "../settings-header";
import { AppearanceForm } from "./appearance-form";

export default function SettingsAppearancePage() {
  return (
    <div className="space-y-6">
      <SettingsHeader heading="Appearance" text=" Customize the appearance of the application." />
      <Separator />
      <AppearanceForm />
    </div>
  );
}
