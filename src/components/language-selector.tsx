import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@wealthvn/ui";

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
  const selectedLanguage = languages.find((lang) => lang.value === value);

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={cn(compact ? "w-[140px]" : "w-[200px]", className)}>
        {selectedLanguage ? (
          <span className="flex items-center gap-2">
            <span>{selectedLanguage.flag}</span>
            <span> {selectedLanguage.label}</span>
          </span>
        ) : (
          <span className="text-muted-foreground">Select language</span>
        )}
      </SelectTrigger>
      <SelectContent>
        {languages.map((language) => (
          <SelectItem key={language.value} value={language.value}>
            <span className="flex items-center gap-2">
              <span>{language.flag}</span>
              <span>{language.label}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
