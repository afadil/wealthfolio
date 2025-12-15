import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Icons } from '@/components/ui/icons';
import { Separator } from '@/components/ui/separator';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { useWealthfolioSync } from '@/context/wealthfolio-sync-context';
import { useState, useEffect } from 'react';
import { ProviderButton } from './provider-button';
import { getPreferredProvider, savePreferredProvider } from '@/lib/cookie-utils';
import { isAppleDevice } from '@/lib/device-utils';

type Provider = 'google' | 'apple' | 'email';

export function SyncLoginForm() {
  const { signInWithOAuth, signInWithMagicLink, error, clearError, isLoading } =
    useWealthfolioSync();

  // State management
  const [email, setEmail] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [loadingProvider, setLoadingProvider] = useState<Provider | null>(null);
  const [preferredProvider, setPreferredProvider] = useState<Provider | null>(null);
  const [isMoreOptionsOpen, setIsMoreOptionsOpen] = useState(false);

  // Load preferred provider from cookie on mount
  useEffect(() => {
    const savedProvider = getPreferredProvider();
    setPreferredProvider(savedProvider);
  }, []);

  // Determine which providers to show at the top
  const getTopProviders = (): Provider[] => {
    // If user has a preference, show it first
    if (preferredProvider) {
      return [preferredProvider];
    }

    // If on Apple device, show both Google and Apple
    if (isAppleDevice()) {
      return ['google', 'apple'];
    }

    // Default: show Google only
    return ['google'];
  };

  // Determine which providers to show in "More options"
  const getMoreOptionsProviders = (): Provider[] => {
    const topProviders = getTopProviders();
    const allProviders: Provider[] = ['google', 'apple', 'email'];
    return allProviders.filter((p) => !topProviders.includes(p));
  };

  const topProviders = getTopProviders();
  const moreOptionsProviders = getMoreOptionsProviders();

  const handleOAuthSignIn = async (provider: 'google' | 'apple') => {
    setLocalError(null);
    setSuccessMessage(null);
    clearError();
    setLoadingProvider(provider);

    try {
      await signInWithOAuth(provider);
      // Save provider preference
      savePreferredProvider(provider);
    } catch (err) {
      // Error is handled by context
      console.error('OAuth sign-in error:', err);
    } finally {
      setLoadingProvider(null);
    }
  };

  const handleMagicLinkSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    setSuccessMessage(null);
    clearError();

    if (!email) {
      setLocalError('Please enter your email address');
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setLocalError('Please enter a valid email address');
      return;
    }

    setLoadingProvider('email');

    try {
      await signInWithMagicLink(email);
      // Save provider preference
      savePreferredProvider('email');
      setSuccessMessage(
        "Check your email! We've sent you a magic link to sign in. The link will expire in 24 hours.",
      );
      setEmail(''); // Clear email input
    } catch (err) {
      // Error is handled by context
      console.error('Magic link error:', err);
    } finally {
      setLoadingProvider(null);
    }
  };

  const displayError = localError ?? error;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 flex h-12 w-12 items-center justify-center rounded-xl">
              <Icons.Globe className="text-primary h-6 w-6" />
            </div>
            <div>
              <CardTitle className="text-lg font-semibold">Sign in to Wealthfolio Sync</CardTitle>
              <CardDescription>
                Connect your broker accounts and access your portfolio from anywhere.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Error Alert */}
          {displayError && (
            <Alert variant="destructive">
              <Icons.AlertCircle className="h-4 w-4" />
              <AlertDescription>{displayError}</AlertDescription>
            </Alert>
          )}

          {/* Success Alert */}
          {successMessage && (
            <Alert>
              <Icons.CheckCircle className="h-4 w-4" />
              <AlertDescription>{successMessage}</AlertDescription>
            </Alert>
          )}

          {/* Top Provider Buttons */}
          <div className="flex flex-col items-center space-y-3">
            {topProviders.includes('google') && (
              <ProviderButton
                provider="google"
                onClick={() => handleOAuthSignIn('google')}
                isLoading={loadingProvider === 'google'}
                isLastUsed={preferredProvider === 'google'}
              />
            )}
            {topProviders.includes('apple') && (
              <ProviderButton
                provider="apple"
                onClick={() => handleOAuthSignIn('apple')}
                isLoading={loadingProvider === 'apple'}
                isLastUsed={preferredProvider === 'apple'}
              />
            )}
            {topProviders.includes('email') && (
              <form onSubmit={handleMagicLinkSignIn} className="w-full max-w-sm space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                  />
                </div>
                <ProviderButton
                  provider="email"
                  onClick={() => {}} // Form submission handles this
                  isLoading={loadingProvider === 'email'}
                  isLastUsed={preferredProvider === 'email'}
                />
              </form>
            )}
          </div>

          {/* Divider */}
          {moreOptionsProviders.length > 0 && (
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <Separator className="mx-auto max-w-sm" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background text-muted-foreground px-2">or</span>
              </div>
            </div>
          )}

          {/* More Sign-in Options (Collapsible) */}
          {moreOptionsProviders.length > 0 && (
            <Collapsible open={isMoreOptionsOpen} onOpenChange={setIsMoreOptionsOpen}>
              <div className="flex justify-center">
                <CollapsibleTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full max-w-sm justify-between"
                    disabled={isLoading}
                  >
                    <span className="text-muted-foreground text-sm">More sign-in options</span>
                    <Icons.ChevronDown
                      className={`h-4 w-4 transition-transform ${
                        isMoreOptionsOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </Button>
                </CollapsibleTrigger>
              </div>
              <CollapsibleContent className="flex flex-col items-center space-y-3 pt-3">
                {moreOptionsProviders.includes('google') && (
                  <ProviderButton
                    provider="google"
                    onClick={() => handleOAuthSignIn('google')}
                    isLoading={loadingProvider === 'google'}
                  />
                )}
                {moreOptionsProviders.includes('apple') && (
                  <ProviderButton
                    provider="apple"
                    onClick={() => handleOAuthSignIn('apple')}
                    isLoading={loadingProvider === 'apple'}
                  />
                )}
                {moreOptionsProviders.includes('email') && (
                  <form onSubmit={handleMagicLinkSignIn} className="w-full max-w-sm space-y-3">
                    <div className="space-y-2">
                      <Label htmlFor="more-email">Email</Label>
                      <Input
                        id="more-email"
                        type="email"
                        placeholder="you@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        autoComplete="email"
                      />
                    </div>
                    <ProviderButton
                      provider="email"
                      onClick={() => {}} // Form submission handles this
                      isLoading={loadingProvider === 'email'}
                    />
                  </form>
                )}
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* Terms and Privacy Footer */}
          <div className="pt-4">
            <p className="text-muted-foreground text-center text-xs">
              By continuing, you agree to our{' '}
              <a
                href="https://wealthfolio.app/legal/terms-of-use"
                target="_blank"
                rel="noreferrer noopener"
                className="hover:text-foreground underline underline-offset-4"
              >
                Terms of Use
              </a>{' '}
              and{' '}
              <a
                href="https://wealthfolio.app/legal/privacy-policy"
                target="_blank"
                rel="noreferrer noopener"
                className="hover:text-foreground underline underline-offset-4"
              >
                Privacy Policy
              </a>
              .
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Security Information Card */}
      <Card className="border-dashed">
        <CardContent className="pt-6">
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <Icons.Shield className="text-muted-foreground mt-0.5 h-5 w-5" />
              <div>
                <p className="text-sm font-medium">Secure Authentication</p>
                <p className="text-muted-foreground text-sm">
                  Your credentials are securely stored in your system&apos;s keychain. You&apos;ll
                  stay signed in until you explicitly sign out.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Icons.Refresh className="text-muted-foreground mt-0.5 h-5 w-5" />
              <div>
                <p className="text-sm font-medium">Automatic Token Refresh</p>
                <p className="text-muted-foreground text-sm">
                  Sessions are automatically refreshed in the background, so you never have to
                  re-login unless you change your password or sign out.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
