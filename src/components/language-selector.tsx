import { cn } from "@/lib/utils";

interface LanguageSelectorProps {
  value?: string;
  onChange: (value: string) => void;
  className?: string;
  compact?: boolean;
}

const languages = [
  {
    value: "en",
    label: "English",
    flag: "🇺🇸",
  },
  {
    value: "vi",
    label: "Tiếng Việt",
    flag: "🇻🇳",
  },
];

export function LanguageSelector({
  value,
  onChange,
  className,
  compact = false,
}: LanguageSelectorProps) {
  return (
    <div className={cn("grid grid-cols-2", compact ? "gap-1.5" : "gap-2 md:gap-4", className)}>
      {languages.map((language) => (
        <button
          key={language.value}
          type="button"
          onClick={() => onChange(language.value)}
          className={cn(
            "hover:bg-accent/50 relative flex flex-col items-center justify-center rounded-lg border-2 transition-all duration-200",
            compact ? "p-1.5 sm:p-2" : "p-3 sm:p-4",
            value === language.value
              ? "border-primary bg-accent/30"
              : "border-muted hover:border-accent",
          )}
        >
          <div className={cn("mb-0.5", compact ? "text-base sm:text-lg" : "text-2xl sm:text-3xl")}>
            {language.flag}
          </div>
          <div
            className={cn("font-medium", compact ? "text-[10px] sm:text-xs" : "text-xs sm:text-sm")}
          >
            {language.label}
          </div>
          {value === language.value && (
            <div className="bg-primary absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full" />
          )}
        </button>
      ))}
    </div>
  );
}
