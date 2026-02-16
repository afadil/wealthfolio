import { useController, type Control, type FieldValues, type FieldPath } from "react-hook-form";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { cn } from "@/lib/utils";
import { motion } from "motion/react";
import { useId } from "react";

export type AssetType = "stock" | "option" | "bond";

interface AssetTypeOption {
  value: AssetType;
  label: string;
  icon: keyof typeof Icons;
}

const assetTypes: AssetTypeOption[] = [
  { value: "stock", label: "Stock", icon: "TrendingUp" },
  { value: "option", label: "Option", icon: "BarChart" },
  { value: "bond", label: "Bond", icon: "FileText" },
];

interface AssetTypeSelectorProps<TFieldValues extends FieldValues = FieldValues> {
  control: Control<TFieldValues>;
  name?: FieldPath<TFieldValues>;
  defaultValue?: AssetType;
  onValueChange?: (value: AssetType) => void;
  className?: string;
}

export function AssetTypeSelector<TFieldValues extends FieldValues = FieldValues>({
  control,
  name = "assetType" as FieldPath<TFieldValues>,
  defaultValue = "stock",
  onValueChange,
  className,
}: AssetTypeSelectorProps<TFieldValues>) {
  const uniqueId = useId();

  const { field } = useController({
    name,
    control,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    defaultValue: defaultValue as any,
  });

  const handleSelect = (value: AssetType) => {
    field.onChange(value);
    onValueChange?.(value);
  };

  return (
    <div
      className={cn(
        "bg-muted relative inline-flex items-center gap-1 rounded-lg p-1",
        className,
      )}
    >
      {assetTypes.map((type) => {
        const Icon = Icons[type.icon];
        const isSelected = field.value === type.value;

        return (
          <button
            key={type.value}
            onClick={() => handleSelect(type.value)}
            type="button"
            className={cn(
              "relative z-10 flex cursor-pointer items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors select-none",
              "focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
              isSelected
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {isSelected && (
              <motion.div
                layoutId={`asset-type-indicator-${uniqueId}`}
                className="bg-background absolute inset-0 -z-10 rounded-md shadow-sm"
                initial={false}
                transition={{
                  type: "spring",
                  stiffness: 400,
                  damping: 30,
                }}
              />
            )}
            <Icon className="h-4 w-4" />
            <span>{type.label}</span>
          </button>
        );
      })}
    </div>
  );
}
