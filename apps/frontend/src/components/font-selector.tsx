import { SelectionCard } from "@/components/selection-card";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

interface FontSelectorProps {
  value?: string;
  onChange: (value: string) => void;
  className?: string;
}

const fonts = [
  {
    value: "font-sans",
    labelKey: "component.font_sans",
    preview: "Aa",
  },
  {
    value: "font-serif",
    labelKey: "component.font_serif",
    preview: "Aa",
  },
  {
    value: "font-mono",
    labelKey: "component.font_mono",
    preview: "Aa",
  },
];

export function FontSelector({ value, onChange, className }: FontSelectorProps) {
  const { t } = useTranslation();
  return (
    <div className={cn("grid grid-cols-3 gap-2 md:gap-4", className)}>
      {fonts.map((font) => (
        <button
          key={font.value}
          type="button"
          aria-pressed={value === font.value}
          onClick={() => onChange(font.value)}
          className="focus-visible:ring-ring rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
        >
          <SelectionCard selected={value === font.value} label={t(`common:${font.labelKey}`)}>
            <div
              className={cn(
                "flex h-14 items-center justify-center text-xl font-medium sm:h-16 sm:text-2xl",
                font.value,
              )}
            >
              {font.preview}
            </div>
          </SelectionCard>
        </button>
      ))}
    </div>
  );
}
