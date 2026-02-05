import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SettingsHeader } from "../settings-header";
import { AllocationPreferencesForm } from "./allocation-preferences-form";
import { AllocationMaintenanceForm } from "./allocation-maintenance-form";

export default function SettingsAllocationPage() {
  return (
    <div className="space-y-6">
      <SettingsHeader
        heading="Allocation"
        text="Configure preferences for the allocation and rebalancing features."
      />
      <Separator />
      <Tabs defaultValue="preferences" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="preferences">Preferences</TabsTrigger>
          <TabsTrigger value="maintenance">Maintenance</TabsTrigger>
        </TabsList>
        <TabsContent value="preferences" className="mt-6">
          <AllocationPreferencesForm />
        </TabsContent>
        <TabsContent value="maintenance" className="mt-6">
          <AllocationMaintenanceForm />
        </TabsContent>
      </Tabs>
    </div>
  );
}
