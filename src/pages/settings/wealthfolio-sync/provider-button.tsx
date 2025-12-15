import { Button } from '@/components/ui/button';
import { Icons } from '@/components/ui/icons';
import { cn } from '@/lib/utils';

interface ProviderButtonProps {
  provider: 'google' | 'apple' | 'email';
  onClick: () => void;
  isLoading: boolean;
  isLastUsed?: boolean;
  variant?: 'default' | 'outline';
  className?: string;
}

export function ProviderButton({
  provider,
  onClick,
  isLoading,
  isLastUsed = false,
  variant = 'outline',
  className,
}: ProviderButtonProps) {
  const providerConfig = {
    google: {
      icon: Icons.Google,
      label: 'Continue with Google',
    },
    apple: {
      icon: Icons.Apple,
      label: 'Continue with Apple',
    },
    email: {
      icon: Icons.Mail,
      label: 'Continue with Email',
    },
  };

  const config = providerConfig[provider];
  const Icon = config.icon;

  return (
    <Button
      type="button"
      variant={variant}
      onClick={onClick}
      disabled={isLoading}
      className={cn('relative h-12 w-full max-w-sm justify-start gap-3', className)}
    >
      {isLoading ? (
        <Icons.Spinner className="h-5 w-5 animate-spin" />
      ) : (
        <Icon className="h-5 w-5" />
      )}
      <span className="flex-1 text-center">{config.label}</span>
      {isLastUsed && !isLoading && (
        <span className="text-muted-foreground absolute right-3 text-xs">Last used</span>
      )}
    </Button>
  );
}
