import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Badge,
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Icons,
} from "@wealthfolio/ui";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import type { CategoryRule, CategoryWithChildren } from "@/lib/types";
import { testCategoryRulePattern } from "@/commands/category-rule";

type FormMatchType = "contains" | "starts_with" | "exact";

const ruleFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  pattern: z.string().min(1, "Pattern is required"),
  matchType: z.enum(["contains", "starts_with", "exact"]),
  categoryId: z.string().min(1, "Category is required"),
  subCategoryId: z.string().optional(),
  priority: z.coerce.number().int().min(0),
  isGlobal: z.boolean(),
});

type RuleFormValues = z.infer<typeof ruleFormSchema>;

interface RuleFormProps {
  rule?: CategoryRule;
  categories: CategoryWithChildren[];
  onSubmit: (values: RuleFormValues) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

const MATCH_TYPE_OPTIONS: { value: FormMatchType; label: string; description: string }[] = [
  { value: "contains", label: "Contains", description: "Pattern found anywhere in text" },
  { value: "starts_with", label: "Starts with", description: "Text begins with pattern" },
  { value: "exact", label: "Exact match", description: "Text matches pattern exactly" },
];

export function RuleForm({
  rule,
  categories,
  onSubmit,
  onCancel,
  isLoading,
}: RuleFormProps) {
  const [testText, setTestText] = useState("");
  const [testResult, setTestResult] = useState<boolean | null>(null);
  const [testing, setTesting] = useState(false);

  const form = useForm<RuleFormValues>({
    resolver: zodResolver(ruleFormSchema) as never,
    defaultValues: {
      name: rule?.name ?? "",
      pattern: rule?.pattern ?? "",
      matchType: (rule?.matchType as FormMatchType) ?? "contains",
      categoryId: rule?.categoryId ?? "",
      subCategoryId: rule?.subCategoryId ?? undefined,
      priority: rule?.priority ?? 0,
      isGlobal: rule ? Boolean(rule.isGlobal) : true,
    },
  });

  const selectedCategoryId = form.watch("categoryId");
  const selectedCategory = categories.find((cat) => cat.id === selectedCategoryId);
  const subCategories = selectedCategory?.children ?? [];

  // Reset subcategory when parent category changes
  useEffect(() => {
    if (selectedCategoryId !== rule?.categoryId) {
      form.setValue("subCategoryId", undefined);
    }
  }, [selectedCategoryId, rule?.categoryId, form]);

  const handleTest = async () => {
    const pattern = form.getValues("pattern");
    const matchType = form.getValues("matchType");

    if (!pattern || !testText) return;

    setTesting(true);
    try {
      const result = await testCategoryRulePattern(pattern, matchType, testText);
      setTestResult(result);
    } catch {
      setTestResult(false);
    } finally {
      setTesting(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit as never)} className="space-y-4">
        <FormField
          control={form.control as never}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Rule Name</FormLabel>
              <FormControl>
                <Input placeholder="e.g., Grocery stores" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control as never}
            name="pattern"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Pattern</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., walmart" {...field} />
                </FormControl>
                <FormDescription>Text to match in transaction name</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control as never}
            name="matchType"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Match Type</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select match type" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {MATCH_TYPE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        <div className="flex flex-col">
                          <span>{option.label}</span>
                          <span className="text-muted-foreground text-xs">
                            {option.description}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Pattern Tester */}
        <div className="bg-muted/50 rounded-md border p-3">
          <div className="mb-2 text-sm font-medium">Test Pattern</div>
          <div className="flex gap-2">
            <Input
              placeholder="Enter test text..."
              value={testText}
              onChange={(e) => {
                setTestText(e.target.value);
                setTestResult(null);
              }}
              className="flex-1"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleTest}
              disabled={testing || !testText || !form.getValues("pattern")}
            >
              {testing ? (
                <Icons.Spinner className="h-4 w-4 animate-spin" />
              ) : (
                "Test"
              )}
            </Button>
          </div>
          {testResult !== null && (
            <div className="mt-2">
              <Badge variant={testResult ? "default" : "destructive"}>
                {testResult ? "Match" : "No Match"}
              </Badge>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control as never}
            name="categoryId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Category</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        <div className="flex items-center gap-2">
                          <span className={`font-semibold ${cat.isIncome ? "text-success" : "text-destructive"}`}>
                            {cat.isIncome ? "+" : "−"}
                          </span>
                          {cat.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control as never}
            name="subCategoryId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Subcategory (Optional)</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  value={field.value || ""}
                  disabled={subCategories.length === 0}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select subcategory" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {subCategories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control as never}
          name="priority"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Priority</FormLabel>
              <FormControl>
                <Input type="number" min={0} {...field} />
              </FormControl>
              <FormDescription>
                Higher priority rules are checked first (0-100)
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end gap-2 pt-4">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={isLoading}>
            {isLoading ? (
              <>
                <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : rule ? (
              "Update Rule"
            ) : (
              "Create Rule"
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}
