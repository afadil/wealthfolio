import { useBalancePrivacy } from '@/context/privacy-context';
import { Button } from '@/components/ui/button';
import { Icons } from '@/components/icons';
import { cn } from '@/lib/utils';

interface PrivacyToggleProps {
  className?: string;
}

export function PrivacyToggle({ className }: PrivacyToggleProps) {
  const { isBalanceHidden, toggleBalanceVisibility } = useBalancePrivacy();

  return (
    <Button
      variant="secondary"
      size="icon"
      className={cn('mt-1 h-8 w-8 rounded-full', className)}
      onClick={(e) => {
        e.stopPropagation();
        toggleBalanceVisibility();
      }}
    >
      {isBalanceHidden ? <Icons.Eye className="h-4 w-4" /> : <Icons.EyeOff className="h-4 w-4" />}
    </Button>
  );
}
