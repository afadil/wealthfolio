import type { BaseSyntheticEvent } from "react";
import type {
  FieldErrors,
  FieldValues,
  SubmitHandler,
  UseFormGetValues,
  UseFormReturn,
} from "react-hook-form";
import i18n from "@/i18n/i18n";
import { toast } from "sonner";

interface ValidationIssue {
  fieldPath: string;
  message: string;
}

function formatFieldName(fieldPath: string): string {
  const leaf = fieldPath.split(".").at(-1) ?? fieldPath;
  const cleaned = leaf.replace(/\[\d+\]/g, "");
  const key = `activity.form.fields.${cleaned}`;
  return i18n.exists(key) ? i18n.t(key) : cleaned;
}

function collectIssues(errors: FieldErrors<FieldValues>): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const walk = (value: unknown, path: string[] = []) => {
    if (!value || typeof value !== "object") return;

    const record = value as Record<string, unknown>;

    if (typeof record.message === "string" && record.message.trim()) {
      issues.push({
        fieldPath: path.join("."),
        message: record.message.trim(),
      });
    }

    for (const [key, nested] of Object.entries(record)) {
      if (key === "message" || key === "type" || key === "ref") continue;
      if (nested && typeof nested === "object") {
        walk(nested, [...path, key]);
      }
    }
  };

  walk(errors);

  const unique = new Map<string, ValidationIssue>();
  for (const issue of issues) {
    const label = formatFieldName(issue.fieldPath);
    const key = `${label}:${issue.message}`;
    if (!unique.has(key)) {
      unique.set(key, issue);
    }
  }

  return Array.from(unique.values());
}

export function showValidationToast<T extends FieldValues>(
  errors: FieldErrors<T>,
  getValues: UseFormGetValues<T>,
): void {
  const issues = collectIssues(errors as FieldErrors<FieldValues>);
  if (issues.length === 0) return;

  const lines = issues.slice(0, 3).map((issue) => {
    const fieldName = formatFieldName(issue.fieldPath);
    return `${fieldName}: ${issue.message}`;
  });
  const suffix =
    issues.length > 3
      ? ` ${i18n.t("activity.validation.more_suffix", { count: issues.length - 3 })}`
      : "";

  toast.error(i18n.t("activity.validation.title"), {
    id: "activity-form-validation",
    description: `${lines.join(" • ")}${suffix}`,
  });

  console.error("[ActivityForm] Submit blocked by validation", {
    errors,
    values: getValues(),
  });
}

export function createValidatedSubmit<T extends FieldValues>(
  form: UseFormReturn<T>,
  onValidSubmit: SubmitHandler<T>,
): (event?: BaseSyntheticEvent) => Promise<void> {
  const handler = form.handleSubmit(onValidSubmit, (errors) => {
    showValidationToast(errors, form.getValues);
  });

  return async (event?: BaseSyntheticEvent) => {
    try {
      await handler(event);
    } catch (err) {
      console.error("[ActivityForm] Unhandled submit error:", err);
      toast.error(i18n.t("toast.common.unexpected_error"), {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };
}
