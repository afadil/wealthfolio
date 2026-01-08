import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
  FormDescription,
  Input,
  Button,
  Icons,
  Textarea,
} from "@wealthfolio/ui";
import type { TaxonomyCategory } from "@/lib/types";
import { useUpdateCategory } from "@/hooks/use-taxonomies";
import { toast } from "sonner";

const categoryFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  key: z.string().min(1, "Key is required"),
  color: z.string().min(1, "Color is required"),
  description: z.string().optional().nullable(),
});

type CategoryFormValues = z.infer<typeof categoryFormSchema>;

interface CategoryFormProps {
  category: TaxonomyCategory;
  taxonomyId: string;
  onClose: () => void;
}

export function CategoryForm({ category, taxonomyId: _taxonomyId, onClose }: CategoryFormProps) {
  void _taxonomyId; // Keep for potential future use
  const updateMutation = useUpdateCategory();

  const form = useForm<CategoryFormValues>({
    resolver: zodResolver(categoryFormSchema),
    defaultValues: {
      name: category.name,
      key: category.key,
      color: category.color,
      description: category.description ?? "",
    },
  });

  // Reset form when category changes
  useEffect(() => {
    form.reset({
      name: category.name,
      key: category.key,
      color: category.color,
      description: category.description ?? "",
    });
  }, [category, form]);

  const onSubmit = async (values: CategoryFormValues) => {
    try {
      await updateMutation.mutateAsync({
        ...category,
        name: values.name,
        key: values.key,
        color: values.color,
        description: values.description ?? null,
      });
      toast.success("Category updated successfully");
    } catch (error) {
      toast.error("Failed to update category");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span
            className="w-4 h-4 rounded-full shrink-0"
            style={{ backgroundColor: category.color }}
          />
          <h3 className="font-semibold text-lg">{category.name}</h3>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <Icons.Close className="h-4 w-4" />
        </Button>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Name</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="color"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Color</FormLabel>
                <FormControl>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={field.value}
                      onChange={field.onChange}
                      className="h-9 w-12 cursor-pointer rounded border p-1"
                    />
                    <Input {...field} className="flex-1 font-mono" placeholder="#808080" />
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Description</FormLabel>
                <FormControl>
                  <Textarea
                    {...field}
                    value={field.value ?? ""}
                    placeholder="Optional description for this category"
                    rows={3}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="flex items-center gap-2 pt-4">
            <Button
              type="submit"
              disabled={updateMutation.isPending || !form.formState.isDirty}
            >
              {updateMutation.isPending ? (
                <>
                  <Icons.Loader className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => form.reset()}
              disabled={!form.formState.isDirty}
            >
              Reset
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
