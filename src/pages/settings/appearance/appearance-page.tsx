import { Separator } from "@/components/ui/separator";
import { AppearanceForm } from "./appearance-form";
import { SettingsHeader } from "../header";

export default function SettingsAppearancePage() {
  return (
    <div className="space-y-6">
      <SettingsHeader heading="Appearance" text=" Customize the appearance of the application." />
      <Separator />
      <AppearanceForm />
    </div>
  );
}
