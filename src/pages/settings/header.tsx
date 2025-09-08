import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Icons } from '@/components/ui/icons';
import { useNavigate } from 'react-router-dom';

interface SettingsHeaderProps {
  heading: string;
  text?: string;
  className?: string;
  children?: React.ReactNode;
  showBackOnMobile?: boolean;
  backTo?: string;
  onBack?: () => void;
}

export function SettingsHeader({
  heading,
  text,
  className,
  children,
  showBackOnMobile = true,
  backTo = '/settings',
  onBack,
}: SettingsHeaderProps) {
  const navigate = useNavigate();

  const handleBack = () => {
    if (onBack) {
      onBack();
      return;
    }
    navigate(backTo);
  };

  return (
    <div
      className={cn(
        'flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between',
        className,
      )}
    >
      <div className="flex items-start gap-2">
        {showBackOnMobile && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleBack}
            className="ml-1 lg:hidden"
          >
            <Icons.ArrowLeft className="h-4 w-4" />
          </Button>
        )}
        <div className="grid gap-1">
          <h1 className="font-heading text-lg lg:text-xl font-bold break-words">{heading}</h1>
          {text && (
            <p className="text-sm lg:text-md font-light text-muted-foreground break-words">{text}</p>
          )}
        </div>
      </div>
      {children && <div className="shrink-0">{children}</div>}
    </div>
  );
}
