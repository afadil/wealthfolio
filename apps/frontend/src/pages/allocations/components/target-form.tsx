import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import type * as z from "zod";

import { Button } from "@wealthfolio/ui/components/ui/button";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@wealthfolio/ui/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@wealthfolio/ui/components/ui/form";
import { Input } from "@wealthfolio/ui/components/ui/input";

import { newPortfolioTargetSchema } from "@/lib/schemas";
import { useTargetMutations } from "../use-target-mutations";

type NewPortfolioTarget = z.infer<typeof newPortfolioTargetSchema>;

interface TargetFormProps {
  defaultValues?: NewPortfolioTarget;
  accountId: string;
  onSuccess?: () => void;
}

export function TargetForm({ defaultValues, accountId, onSuccess = () => undefined }: TargetFormProps) {
  const { createTargetMutation, updateTargetMutation } = useTargetMutations();

  const form = useForm<NewPortfolioTarget>({
    resolver: zodResolver(newPortfolioTargetSchema),
    defaultValues: defaultValues ?? {
      name: "",
      accountId,
      taxonomyId: "asset_classes",
      isActive: true,
    },
  });

  function onSubmit(data: NewPortfolioTarget) {
    const { id, ...rest } = data;
    if (id) {
      return updateTargetMutation.mutate({ id, ...rest, createdAt: "", updatedAt: "" }, { onSuccess });
    }
    return createTargetMutation.mutate(data, { onSuccess });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <DialogHeader>
          <DialogTitle>{defaultValues?.id ? "Update Target" : "Create Target"}</DialogTitle>
          <DialogDescription>
            {defaultValues?.id
              ? "Update your allocation target."
              : "Create a target allocation profile for this account."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 p-4">
          <input type="hidden" name="id" />
          <input type="hidden" name="accountId" value={accountId} />

          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Target Name</FormLabel>
                <FormControl>
                  <Input placeholder="e.g. My Asset Allocation" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <DialogFooter className="gap-2">
          <DialogTrigger asChild>
            <Button variant="outline">Cancel</Button>
          </DialogTrigger>
          <Button type="submit">
            <Icons.Plus className="h-4 w-4" />
            <span>{defaultValues?.id ? "Update" : "Create"}</span>
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
