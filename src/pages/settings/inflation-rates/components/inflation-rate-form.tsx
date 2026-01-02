import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";

import { Button } from "@/components/ui/button";
import { Icons } from "@/components/ui/icons";
import { Card, CardContent } from "@/components/ui/card";

import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
  Input,
} from "@wealthfolio/ui";

import { newInflationRateSchema } from "@/lib/schemas";
import { useInflationRateMutations } from "../use-inflation-rate-mutations";

type NewInflationRate = z.infer<typeof newInflationRateSchema>;

interface InflationRateFormProps {
  defaultValues?: NewInflationRate;
  defaultCountryCode?: string;
  onSuccess?: () => void;
}

export function InflationRateForm({
  defaultValues,
  defaultCountryCode = "US",
  onSuccess = () => {},
}: InflationRateFormProps) {
  const { addInflationRateMutation, updateInflationRateMutation } = useInflationRateMutations();

  const form = useForm<NewInflationRate>({
    resolver: zodResolver(newInflationRateSchema),
    defaultValues: {
      countryCode: defaultCountryCode,
      year: new Date().getFullYear(),
      rate: 0,
      referenceDate: "12-31",
      dataSource: "manual",
      ...defaultValues,
    },
  });

  function onSubmit(data: NewInflationRate) {
    const { id, ...rest } = data;

    if (id) {
      return updateInflationRateMutation.mutate({ id, updatedRate: rest }, { onSuccess });
    }
    return addInflationRateMutation.mutate(rest, { onSuccess });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="mx-auto w-full max-w-4xl space-y-8">
        <DialogHeader className="px-1">
          <DialogTitle className="text-2xl font-semibold">
            {defaultValues?.id ? "Update Inflation Rate" : "Add Inflation Rate"}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground mt-1 text-base">
            {defaultValues?.id
              ? "Update inflation rate information"
              : "Add a new inflation rate manually."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 px-1">
          <Card className="border-border/40 w-full overflow-hidden rounded-lg border shadow-sm">
            <CardContent className="p-6">
              <div className="space-y-6">
                <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="countryCode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base font-medium">Country Code</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g., US, FR, DE"
                            {...field}
                            className="h-11 text-base uppercase"
                            maxLength={3}
                          />
                        </FormControl>
                        <FormDescription className="text-muted-foreground mt-1 text-sm">
                          ISO 3166-1 alpha-2 country code
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="year"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base font-medium">Year</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            placeholder="e.g., 2024"
                            value={field.value || ""}
                            onChange={(e) => {
                              const numValue =
                                e.target.value === "" ? undefined : Number(e.target.value);
                              field.onChange(numValue);
                            }}
                            className="h-11 text-base"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="rate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-base font-medium">Inflation Rate (%)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="e.g., 3.5"
                          value={field.value || ""}
                          onChange={(e) => {
                            const numValue =
                              e.target.value === "" ? undefined : Number(e.target.value);
                            field.onChange(numValue);
                          }}
                          className="h-11 text-base"
                        />
                      </FormControl>
                      <FormDescription className="text-muted-foreground mt-1 text-sm">
                        Annual consumer price inflation rate as percentage
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        <DialogFooter className="px-1 pt-2">
          <div className="flex w-full justify-end gap-3">
            <DialogTrigger asChild>
              <Button variant="outline" type="button" className="h-11 min-w-24 text-base">
                Cancel
              </Button>
            </DialogTrigger>
            <Button
              type="submit"
              disabled={
                addInflationRateMutation.isPending || updateInflationRateMutation.isPending
              }
              className="h-11 min-w-24 text-base"
            >
              {addInflationRateMutation.isPending || updateInflationRateMutation.isPending ? (
                <>
                  <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
                  {defaultValues?.id ? "Updating..." : "Saving..."}
                </>
              ) : (
                <>
                  <Icons.Check className="mr-2 h-4 w-4" />
                  {defaultValues?.id ? "Update" : "Save"}
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </form>
    </Form>
  );
}
