import type { TFunction } from "i18next";
import { useEffect, useMemo } from "react";
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
  Input,
  Button,
  Icons,
  Textarea,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@wealthfolio/ui";
import type { TaxonomyCategory } from "@/lib/types";
import { localizeCategoryName } from "@/lib/taxonomy-i18n";
import { useCreateCategory, useUpdateCategory, useDeleteCategory } from "@/hooks/use-taxonomies";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

function createCategoryFormSchema(t: TFunction) {
  return z.object({
    name: z.string().min(1, t("settings.taxonomies.form.validation.name_required")),
    key: z.string().min(1, t("settings.taxonomies.form.validation.key_required")),
    color: z.string().min(1, t("settings.taxonomies.form.validation.color_required")),
    description: z.string().optional().nullable(),
  });
}

type CategoryFormValues = z.infer<ReturnType<typeof createCategoryFormSchema>>;

interface CategoryFormProps {
  category?: TaxonomyCategory;
  taxonomyId: string;
  taxonomyColor?: string;
  isSystem?: boolean;
  onClose: () => void;
  onCreate?: () => void;
  onDelete?: () => void;
}

function generateKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

export function CategoryForm({
  category,
  taxonomyId,
  taxonomyColor,
  isSystem,
  onClose,
  onCreate,
  onDelete,
}: CategoryFormProps) {
  const { t } = useTranslation("common");
  const categoryFormSchema = useMemo(() => createCategoryFormSchema(t), [t]);
  const isCreateMode = !category;
  const createMutation = useCreateCategory();
  const updateMutation = useUpdateCategory();
  const deleteMutation = useDeleteCategory();
  const isReadonlySystemCategory = !isCreateMode && Boolean(isSystem);
  const localizedNameForDisplay = category
    ? localizeCategoryName(
        t,
        isSystem ? { id: taxonomyId, isSystem: true } : undefined,
        category,
      )
    : "";

  const form = useForm<CategoryFormValues>({
    resolver: zodResolver(categoryFormSchema),
    defaultValues: {
      name: localizedNameForDisplay,
      key: category?.key ?? "",
      color: category?.color ?? taxonomyColor ?? "#808080",
      description: category?.description ?? "",
    },
  });

  // Reset form when category changes
  useEffect(() => {
    form.reset({
      name: localizedNameForDisplay,
      key: category?.key ?? "",
      color: category?.color ?? taxonomyColor ?? "#808080",
      description: category?.description ?? "",
    });
  }, [localizedNameForDisplay, category, taxonomyColor, form]);

  // Auto-generate key from name in create mode
  const watchName = form.watch("name");
  useEffect(() => {
    if (isCreateMode && watchName) {
      form.setValue("key", generateKey(watchName), { shouldDirty: true });
    }
  }, [isCreateMode, watchName, form]);

  const onSubmit = async (values: CategoryFormValues) => {
    try {
      if (isCreateMode) {
        await createMutation.mutateAsync({
          taxonomyId,
          parentId: null, // One level only
          name: values.name,
          key: values.key,
          color: values.color,
          description: values.description ?? null,
          sortOrder: 0,
        });
        toast.success(t("settings.taxonomies.form.toast_create_success"));
        onCreate?.();
      } else if (category) {
        await updateMutation.mutateAsync({
          ...category,
          name: values.name,
          key: values.key,
          color: values.color,
          description: values.description ?? null,
        });
        toast.success(t("settings.taxonomies.form.toast_update_success"));
      }
    } catch {
      toast.error(
        isCreateMode
          ? t("settings.taxonomies.form.toast_create_error")
          : t("settings.taxonomies.form.toast_update_error"),
      );
    }
  };

  const handleDelete = async () => {
    if (!category) return;
    try {
      await deleteMutation.mutateAsync({
        taxonomyId,
        categoryId: category.id,
      });
      toast.success(t("settings.taxonomies.form.toast_delete_success"));
      onDelete?.();
    } catch {
      toast.error(t("settings.taxonomies.form.toast_delete_error"));
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;
  const currentColor = form.watch("color");
  const categoryHeading = category
    ? localizeCategoryName(
        t,
        isSystem ? { id: taxonomyId, isSystem: true } : undefined,
        category,
      )
    : "";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span
            className="h-4 w-4 shrink-0 rounded-full"
            style={{ backgroundColor: currentColor }}
          />
          <h3 className="text-lg font-semibold">
            {isCreateMode ? t("settings.taxonomies.form.title_new") : categoryHeading}
          </h3>
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
                <FormLabel>{t("settings.taxonomies.form.label_name")}</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    disabled={isReadonlySystemCategory}
                    placeholder={t("settings.taxonomies.form.placeholder_name")}
                  />
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
                <FormLabel>{t("settings.taxonomies.form.label_color")}</FormLabel>
                <FormControl>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={field.value}
                      onChange={field.onChange}
                      disabled={isReadonlySystemCategory}
                      className="h-9 w-12 cursor-pointer rounded border p-1"
                    />
                    <Input
                      {...field}
                      disabled={isReadonlySystemCategory}
                      className="flex-1 font-mono"
                      placeholder={t("settings.taxonomies.form.placeholder_color_hex")}
                    />
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
                <FormLabel>{t("settings.taxonomies.form.label_description")}</FormLabel>
                <FormControl>
                  <Textarea
                    {...field}
                    value={field.value ?? ""}
                    disabled={isReadonlySystemCategory}
                    placeholder={t("settings.taxonomies.form.placeholder_description")}
                    rows={3}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="flex items-center justify-between pt-4">
            <div className="flex items-center gap-2">
              {!isReadonlySystemCategory && (
                <>
                  <Button
                    type="submit"
                    disabled={isPending || (!isCreateMode && !form.formState.isDirty)}
                  >
                    {isPending ? (
                      <>
                        <Icons.Loader className="mr-2 h-4 w-4 animate-spin" />
                        {isCreateMode
                          ? t("settings.taxonomies.form.creating")
                          : t("settings.taxonomies.form.saving")}
                      </>
                    ) : isCreateMode ? (
                      t("settings.taxonomies.form.submit_create")
                    ) : (
                      t("settings.taxonomies.form.submit_save")
                    )}
                  </Button>
                  {!isCreateMode && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => form.reset()}
                      disabled={!form.formState.isDirty}
                    >
                      {t("settings.taxonomies.form.reset")}
                    </Button>
                  )}
                </>
              )}
            </div>

            {/* Delete button for non-system taxonomies */}
            {!isCreateMode && !isSystem && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    disabled={deleteMutation.isPending}
                  >
                    {deleteMutation.isPending ? (
                      <Icons.Loader className="h-4 w-4 animate-spin" />
                    ) : (
                      <Icons.Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t("settings.taxonomies.form.delete_title")}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {t("settings.taxonomies.form.delete_description", {
                        name: categoryHeading || category?.name || "",
                      })}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t("settings.shared.cancel")}</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDelete}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      {t("settings.shared.delete")}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </form>
      </Form>
    </div>
  );
}
