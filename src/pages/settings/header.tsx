import { cn } from '@/lib/utils';
interface SettingsHeaderProps {
  heading: string;
  text?: string;
  className?: string;
  children?: React.ReactNode;
}

export function SettingsHeader({ heading, text, className, children }: SettingsHeaderProps) {
  return (
    <div className={cn('flex flex-col space-y-2 lg:flex-row lg:items-center lg:justify-between lg:space-y-0', className)}>
      <div className="grid gap-1">
        <h1 className="font-heading text-lg lg:text-xl font-bold break-words">{heading}</h1>
        {text && <p className="text-sm lg:text-md font-light text-muted-foreground break-words">{text}</p>}
      </div>
      {children && <div className="shrink-0">{children}</div>}
    </div>
  );
}
