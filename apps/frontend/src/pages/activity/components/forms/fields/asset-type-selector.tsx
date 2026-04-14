import { useController, type Control, type FieldValues, type FieldPath } from "react-hook-form";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { cn } from "@/lib/utils";
import { motion } from "motion/react";
import { useId, useMemo } from "react";
import { useTranslation } from "react-i18next";

export type AssetType = "stock" | "option" | "bond";

interface AssetTypeDef {
  value: AssetType;
  labelKey: string;
  icon: keyof typeof Icons;
}

const ASSET_TYPE_DEFS: AssetTypeDef[] = [
  { value: "stock", labelKey: "activity.form.asset.stock", icon: "TrendingUp" },
  { value: "option", labelKey: "activity.form.asset.option", icon: "BarChart" },
  { value: "bond", labelKey: "activity.form.asset.bond", icon: "FileText" },
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
  const { t } = useTranslation("common");
  const uniqueId = useId();

  const assetTypes = useMemo(
    () => ASSET_TYPE_DEFS.map((def) => ({ ...def, label: t(def.labelKey) })),
    [t],
  );

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
    <div className={cn("bg-muted relative flex items-center gap-1 rounded-lg p-1", className)}>
      {assetTypes.map((type) => {
        const Icon = Icons[type.icon];
        const isSelected = field.value === type.value;

        return (
          <button
            key={type.value}
            onClick={() => handleSelect(type.value)}
            type="button"
            className={cn(
              "relative z-10 flex flex-1 cursor-pointer select-none items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors",
              "focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
              isSelected ? "text-foreground" : "text-muted-foreground hover:text-foreground",
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
