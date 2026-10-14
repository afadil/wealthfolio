import { cn } from "@/lib/utils";
import { AnimatedToggleGroup } from "@wealthfolio/ui";
import { useTranslation } from "react-i18next";

type FontRole = "font-sans" | "font-serif" | "font-mono";

interface FontSelectorProps {
  value?: string;
  onChange: (value: FontRole) => void;
  className?: string;
  "aria-label"?: string;
}

const fonts: { value: FontRole; labelKey: string }[] = [
  { value: "font-sans", labelKey: "common:component.font_sans" },
  { value: "font-serif", labelKey: "common:component.font_serif" },
  { value: "font-mono", labelKey: "common:component.font_mono" },
];

/** Sans, serif or mono, each option set in its own face, as one segmented control. */
export function FontSelector({
  value,
  onChange,
  className,
  "aria-label": ariaLabel,
}: FontSelectorProps) {
  const { t } = useTranslation();
  return (
    <AnimatedToggleGroup<FontRole>
      size="sm"
      value={(value as FontRole | undefined) ?? null}
      onValueChange={onChange}
      className={className}
      aria-label={ariaLabel}
      items={fonts.map((font) => ({
        value: font.value,
        label: (
          <span className="flex items-center gap-1.5">
            <span aria-hidden className={cn("text-[13px] font-semibold", font.value)}>
              Aa
            </span>
            {t(font.labelKey)}
          </span>
        ),
      }))}
    />
  );
}
