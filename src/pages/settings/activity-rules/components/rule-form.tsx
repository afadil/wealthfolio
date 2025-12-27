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
import type { ActivityRule, CategoryWithChildren } from "@/lib/types";
import { RECURRENCE_TYPES } from "@/lib/types";
import { testActivityRulePattern } from "@/commands/activity-rule";
import { ActivityType, ActivityTypeNames } from "@/lib/constants";

type FormMatchType = "contains" | "starts_with" | "exact" | "regex";

const ruleFormSchema = z
  .object({
    name: z.string().min(1, "Name is required"),
    pattern: z.string().min(1, "Pattern is required"),
    matchType: z.enum(["contains", "starts_with", "exact", "regex"]),
    categoryId: z.string().optional(),
    subCategoryId: z.string().optional(),
    activityType: z.string().optional(),
    recurrence: z.enum(["fixed", "variable", "periodic"]).optional(),
    priority: z.coerce.number().int().min(0),
    isGlobal: z.boolean(),
  })
  .refine((data) => data.categoryId || data.activityType || data.recurrence, {
    message: "At least a category, activity type, or recurrence is required",
    path: ["categoryId"],
  });

type RuleFormValues = z.infer<typeof ruleFormSchema>;

interface RuleFormProps {
  rule?: ActivityRule;
  categories: CategoryWithChildren[];
  onSubmit: (values: RuleFormValues) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

const RULE_ACTIVITY_TYPE_OPTIONS = [
  { value: ActivityType.DEPOSIT, label: ActivityTypeNames[ActivityType.DEPOSIT] },
  { value: ActivityType.WITHDRAWAL, label: ActivityTypeNames[ActivityType.WITHDRAWAL] },
  { value: ActivityType.INTEREST, label: ActivityTypeNames[ActivityType.INTEREST] },
  { value: ActivityType.DIVIDEND, label: ActivityTypeNames[ActivityType.DIVIDEND] },
  { value: ActivityType.FEE, label: ActivityTypeNames[ActivityType.FEE] },
  { value: ActivityType.TAX, label: ActivityTypeNames[ActivityType.TAX] },
  { value: ActivityType.TRANSFER_IN, label: ActivityTypeNames[ActivityType.TRANSFER_IN] },
  { value: ActivityType.TRANSFER_OUT, label: ActivityTypeNames[ActivityType.TRANSFER_OUT] },
];

const MATCH_TYPE_OPTIONS: { value: FormMatchType; label: string; description: string }[] = [
  { value: "contains", label: "Contains", description: "Pattern found anywhere in text" },
  { value: "starts_with", label: "Starts with", description: "Text begins with pattern" },
  { value: "exact", label: "Exact match", description: "Text matches pattern exactly" },
  { value: "regex", label: "Regex", description: "Use | for OR (e.g., walmart|costco|target)" },
];

export function RuleForm({ rule, categories, onSubmit, onCancel, isLoading }: RuleFormProps) {
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
      activityType: rule?.activityType ?? "",
      recurrence: rule?.recurrence ?? undefined,
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
      const result = await testActivityRulePattern(pattern, matchType, testText);
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
                      {option.label}
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
          name="pattern"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Pattern</FormLabel>
              <FormControl>
                <Input
                  placeholder={
                    form.watch("matchType") === "regex"
                      ? "e.g., walmart|costco|target"
                      : "e.g., walmart"
                  }
                  {...field}
                />
              </FormControl>
              {form.watch("matchType") === "regex" && (
                <FormDescription>
                  Use | for OR matching (e.g., netflix|spotify|hulu matches any of these)
                </FormDescription>
              )}
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex items-center gap-2">
          <Input
            placeholder="Test pattern..."
            value={testText}
            onChange={(e) => {
              setTestText(e.target.value);
              setTestResult(null);
            }}
            className="flex-1 text-sm"
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleTest}
            disabled={testing || !testText || !form.getValues("pattern")}
          >
            {testing ? <Icons.Spinner className="h-4 w-4 animate-spin" /> : "Test"}
          </Button>
          {testResult !== null && (
            <Badge variant={testResult ? "default" : "destructive"} className="text-xs">
              {testResult ? "Match" : "No Match"}
            </Badge>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control as never}
            name="activityType"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Activity Type</FormLabel>
                <Select
                  onValueChange={(val) => field.onChange(val === "__none__" ? "" : val)}
                  value={field.value || ""}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select activity type" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="__none__">
                      <span className="text-muted-foreground">None</span>
                    </SelectItem>
                    {RULE_ACTIVITY_TYPE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
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
            name="recurrence"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Recurrence</FormLabel>
                <Select
                  onValueChange={(val) => field.onChange(val === "__none__" ? undefined : val)}
                  value={field.value || ""}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select recurrence" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="__none__">
                      <span className="text-muted-foreground">None</span>
                    </SelectItem>
                    {RECURRENCE_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type.charAt(0).toUpperCase() + type.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control as never}
            name="categoryId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Category</FormLabel>
                <Select
                  onValueChange={(val) => field.onChange(val === "__none__" ? "" : val)}
                  value={field.value || ""}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="__none__">
                      <span className="text-muted-foreground">None</span>
                    </SelectItem>
                    {categories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        <div className="flex items-center gap-2">
                          {cat.color && (
                            <span
                              className="h-3 w-3 rounded-full"
                              style={{ backgroundColor: cat.color }}
                            />
                          )}
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
                <FormLabel>Subcategory</FormLabel>
                <Select
                  onValueChange={(val) => field.onChange(val === "__none__" ? undefined : val)}
                  value={field.value || ""}
                  disabled={subCategories.length === 0}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select subcategory" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="__none__">
                      <span className="text-muted-foreground">None</span>
                    </SelectItem>
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
              <FormDescription>Higher priority rules are checked first (0-100)</FormDescription>
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
