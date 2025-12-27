import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Button,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
} from "@wealthfolio/ui";
import type { Category } from "@/lib/types";

const subcategorySchema = z.object({
  name: z.string().min(1, "Name is required"),
});

type SubcategoryFormValues = z.infer<typeof subcategorySchema>;

interface SubcategoryFormProps {
  subcategory?: Category;
  parentCategory: Category;
  onSubmit: (values: { name: string; color: string; isIncome: boolean }) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export function SubcategoryForm({
  subcategory,
  parentCategory,
  onSubmit,
  onCancel,
  isLoading,
}: SubcategoryFormProps) {
  const isEditing = !!subcategory;

  const form = useForm<SubcategoryFormValues>({
    resolver: zodResolver(subcategorySchema),
    defaultValues: {
      name: subcategory?.name ?? "",
    },
  });

  const handleSubmit = (values: SubcategoryFormValues) => {
    // Auto-populate color and isIncome from parent
    // Convert isIncome to boolean (it might be 0/1 from database)
    onSubmit({
      name: values.name,
      color: parentCategory.color ?? "#ef4444",
      isIncome: Boolean(parentCategory.isIncome),
    });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input placeholder="Subcategory name" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="rounded-md border p-3 text-sm">
          <span className="text-muted-foreground">Parent category: </span>
          <span className="font-medium">{parentCategory.name}</span>
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={isLoading}>
            {isLoading ? "Saving..." : isEditing ? "Save Changes" : "Create Subcategory"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
