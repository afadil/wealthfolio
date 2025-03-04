import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
interface SettingsHeaderProps {
  heading: string;
  text?: string;
  className?: string;
  children?: React.ReactNode;
}

export function SettingsHeader({ heading, text, className, children }: SettingsHeaderProps) {
  const { t } = useTranslation();
  return (
    <div className={cn('flex items-center justify-between', className)}>
      <div className="grid gap-1">
        <h1 className="font-heading text-xl font-bold">{t("settings." + heading)}</h1>
        {text && <p className="text-md font-light text-muted-foreground">{t("settings." + text)}</p>}
      </div>
      {children}
    </div>
  );
}
