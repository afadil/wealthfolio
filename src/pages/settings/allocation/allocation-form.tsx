import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";

import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
} from "@/components/ui/form";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useAllocationSettings } from "@/hooks/useAllocationSettings";
import { toast } from "@/components/ui/use-toast";

const allocationFormSchema = z.object({
  holdingTargetMode: z.enum(["preview", "strict"], {
    required_error: "Please select a holding target mode.",
  }),
  defaultView: z.enum(["overview", "holdings-table"], {
    required_error: "Please select a default view.",
  }),
});

type AllocationFormValues = z.infer<typeof allocationFormSchema>;

export function AllocationForm() {
  const { settings, isLoading, updateHoldingTargetMode, updateDefaultView } =
    useAllocationSettings();

  const defaultValues: AllocationFormValues = {
    holdingTargetMode: settings.holdingTargetMode,
    defaultView: settings.defaultView,
  };

  const form = useForm<AllocationFormValues>({
    resolver: zodResolver(allocationFormSchema),
    defaultValues,
  });

  async function handleHoldingTargetModeChange(value: "preview" | "strict") {
    try {
      await updateHoldingTargetMode(value);
      toast({
        title: "Settings updated",
        description: "Holding target mode preference saved successfully.",
      });
    } catch (error) {
      console.error("Failed to update holding target mode:", error);
      toast({
        title: "Error",
        description: "Failed to update holding target mode.",
        variant: "destructive",
      });
    }
  }

  async function handleDefaultViewChange(value: "overview" | "holdings-table") {
    try {
      await updateDefaultView(value);
      toast({
        title: "Settings updated",
        description: "Allocation default view preference saved successfully.",
      });
    } catch (error) {
      console.error("Failed to update allocation default view:", error);
      toast({
        title: "Error",
        description: "Failed to update allocation default view.",
        variant: "destructive",
      });
    }
  }

  if (isLoading) {
    return <div className="text-muted-foreground">Loading settings...</div>;
  }

  return (
    <Form {...form}>
      <div className="max-w-4xl space-y-6">
        <FormField
          control={form.control}
          name="holdingTargetMode"
          render={({ field }) => (
            <FormItem className="space-y-3">
              <div className="space-y-1">
                <FormLabel className="text-base font-medium">Holding Target Mode</FormLabel>
                <FormDescription className="text-sm">
                  Choose how holding-level targets should be enforced in the allocation feature.
                </FormDescription>
              </div>
              <FormControl>
                <RadioGroup
                  onValueChange={(value) => {
                    field.onChange(value);
                    handleHoldingTargetModeChange(value as "preview" | "strict");
                  }}
                  value={field.value}
                  className="flex flex-col space-y-3"
                >
                  <div className="flex items-start space-x-3 rounded-lg border p-4 shadow-sm">
                    <RadioGroupItem value="preview" id="preview" className="mt-0.5" />
                    <div className="flex-1 space-y-1">
                      <label
                        htmlFor="preview"
                        className="cursor-pointer text-sm leading-none font-medium peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                      >
                        Preview Mode (Recommended)
                      </label>
                      <p className="text-muted-foreground text-sm">
                        Holdings targets are optional and informational. You can define them for
                        guidance, but they won't restrict your allocations.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3 rounded-lg border p-4 shadow-sm">
                    <RadioGroupItem value="strict" id="strict" className="mt-0.5" />
                    <div className="flex-1 space-y-1">
                      <label
                        htmlFor="strict"
                        className="cursor-pointer text-sm leading-none font-medium peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                      >
                        Strict Mode
                      </label>
                      <p className="text-muted-foreground text-sm">
                        Holdings targets are enforced. Asset class allocations must exactly match
                        the sum of their holding targets (must equal 100%).
                      </p>
                    </div>
                  </div>
                </RadioGroup>
              </FormControl>
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="defaultView"
          render={({ field }) => (
            <FormItem className="space-y-3">
              <div className="space-y-1">
                <FormLabel className="text-base font-medium">Allocation Default View</FormLabel>
                <FormDescription className="text-sm">
                  Choose the default view when opening the allocation page.
                </FormDescription>
              </div>
              <FormControl>
                <RadioGroup
                  onValueChange={(value) => {
                    field.onChange(value);
                    handleDefaultViewChange(value as "overview" | "holdings-table");
                  }}
                  value={field.value}
                  className="flex flex-col space-y-3"
                >
                  <div className="flex items-start space-x-3 rounded-lg border p-4 shadow-sm">
                    <RadioGroupItem value="overview" id="overview" className="mt-0.5" />
                    <div className="flex-1 space-y-1">
                      <label
                        htmlFor="overview"
                        className="cursor-pointer text-sm leading-none font-medium peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                      >
                        Overview (Recommended)
                      </label>
                      <p className="text-muted-foreground text-sm">
                        Show the main allocation page with pie chart and high-level summary when
                        accessing the allocation feature.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3 rounded-lg border p-4 shadow-sm">
                    <RadioGroupItem value="holdings-table" id="holdings-table" className="mt-0.5" />
                    <div className="flex-1 space-y-1">
                      <label
                        htmlFor="holdings-table"
                        className="cursor-pointer text-sm leading-none font-medium peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                      >
                        Holdings Table
                      </label>
                      <p className="text-muted-foreground text-sm">
                        Show the detailed holdings table view with all positions when accessing the
                        allocation feature.
                      </p>
                    </div>
                  </div>
                </RadioGroup>
              </FormControl>
            </FormItem>
          )}
        />
      </div>
    </Form>
  );
}
