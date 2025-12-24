import { Alert, AlertDescription } from "@wealthfolio/ui/components/ui/alert";
import { Button } from "@wealthfolio/ui/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@wealthfolio/ui/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@wealthfolio/ui/components/ui/collapsible";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { Input } from "@wealthfolio/ui/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@wealthfolio/ui/components/ui/input-otp";
import { Label } from "@wealthfolio/ui/components/ui/label";
import { Separator } from "@wealthfolio/ui/components/ui/separator";
import { useWealthfolioConnect } from "../providers/wealthfolio-connect-provider";
import { WEALTHFOLIO_CONNECT_PORTAL_URL } from "@/lib/constants";
import { getPreferredProvider, savePreferredProvider } from "@/lib/cookie-utils";
import { isAppleDevice } from "@/lib/device-utils";
import { useEffect, useState } from "react";
import { ProviderButton } from "./provider-button";

type Provider = "google" | "apple" | "email";

export function LoginForm() {
  const { signInWithOAuth, signInWithMagicLink, verifyOtp, error, clearError, isLoading } =
    useWealthfolioConnect();

  // State management
  const [email, setEmail] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [loadingProvider, setLoadingProvider] = useState<Provider | null>(null);
  const [preferredProvider, setPreferredProvider] = useState<Provider | null>(null);
  const [isMoreOptionsOpen, setIsMoreOptionsOpen] = useState(false);

  // OTP verification state
  const [showOtpInput, setShowOtpInput] = useState(false);
  const [pendingEmail, setPendingEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");

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
      return ["google", "apple"];
    }

    // Default: show Google only
    return ["google"];
  };

  // Determine which providers to show in "More options"
  const getMoreOptionsProviders = (): Provider[] => {
    const topProviders = getTopProviders();
    const allProviders: Provider[] = ["google", "apple", "email"];
    return allProviders.filter((p) => !topProviders.includes(p));
  };

  const topProviders = getTopProviders();
  const moreOptionsProviders = getMoreOptionsProviders();

  const handleOAuthSignIn = async (provider: "google" | "apple") => {
    setLocalError(null);
    setSuccessMessage(null);
    clearError();
    setLoadingProvider(provider);

    try {
      await signInWithOAuth(provider);
      // Save provider preference
      savePreferredProvider(provider);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sign in failed. Please try again.";
      setLocalError(message);
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
      setLocalError("Please enter your email address");
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setLocalError("Please enter a valid email address");
      return;
    }

    setLoadingProvider("email");

    try {
      await signInWithMagicLink(email);
      // Save provider preference
      savePreferredProvider("email");
      // Store email for OTP verification and show OTP input
      setPendingEmail(email);
      setShowOtpInput(true);
      setEmail(""); // Clear email input
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to send magic link. Please try again.";
      setLocalError(message);
    } finally {
      setLoadingProvider(null);
    }
  };

  const handleOtpVerify = async () => {
    if (otpCode.length !== 6) {
      setLocalError("Please enter the complete 6-digit code");
      return;
    }

    setLocalError(null);
    clearError();
    setLoadingProvider("email");

    try {
      await verifyOtp(pendingEmail, otpCode);
      // Success - context will update isConnected
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Invalid code. Please try again.";
      setLocalError(message);
      setOtpCode(""); // Clear OTP on error
    } finally {
      setLoadingProvider(null);
    }
  };

  const handleBackToEmail = () => {
    setShowOtpInput(false);
    setPendingEmail("");
    setOtpCode("");
    setLocalError(null);
    setSuccessMessage(null);
    clearError();
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
              <CardTitle className="text-lg font-semibold">Sign in to Wealthfolio Connect</CardTitle>
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

          {/* OTP Verification UI */}
          {showOtpInput ? (
            <div className="flex flex-col items-center space-y-4">
              <div className="text-center">
                <p className="text-sm font-medium">Enter verification code</p>
                <p className="text-muted-foreground text-sm">
                  We sent a code to <span className="font-medium">{pendingEmail}</span>
                </p>
              </div>

              <InputOTP
                maxLength={6}
                value={otpCode}
                onChange={setOtpCode}
                onComplete={handleOtpVerify}
              >
                <InputOTPGroup>
                  <InputOTPSlot index={0} />
                  <InputOTPSlot index={1} />
                  <InputOTPSlot index={2} />
                  <InputOTPSlot index={3} />
                  <InputOTPSlot index={4} />
                  <InputOTPSlot index={5} />
                </InputOTPGroup>
              </InputOTP>

              <div className="flex flex-col items-center gap-2">
                <Button
                  onClick={handleOtpVerify}
                  disabled={otpCode.length !== 6 || loadingProvider === "email"}
                  className="w-full max-w-sm"
                >
                  {loadingProvider === "email" ? (
                    <>
                      <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    "Verify"
                  )}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleBackToEmail}
                  className="text-muted-foreground"
                >
                  <Icons.ArrowLeft className="mr-2 h-4 w-4" />
                  Back to sign in
                </Button>
              </div>
            </div>
          ) : (
            <>
              {/* Top Provider Buttons */}
              <div className="flex flex-col items-center space-y-3">
                {topProviders.includes("google") && (
                  <ProviderButton
                    provider="google"
                    onClick={() => handleOAuthSignIn("google")}
                    isLoading={loadingProvider === "google"}
                    isLastUsed={preferredProvider === "google"}
                  />
                )}
                {topProviders.includes("apple") && (
                  <ProviderButton
                    provider="apple"
                    onClick={() => handleOAuthSignIn("apple")}
                    isLoading={loadingProvider === "apple"}
                    isLastUsed={preferredProvider === "apple"}
                  />
                )}
                {topProviders.includes("email") && (
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
                        className="rounded-full"
                      />
                    </div>
                    <ProviderButton
                      provider="email"
                      type="submit"
                      onClick={() => {}}
                      isLoading={loadingProvider === "email"}
                      isLastUsed={preferredProvider === "email"}
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
            </>
          )}

          {/* More Sign-in Options (Collapsible) - Hidden during OTP */}
          {!showOtpInput && moreOptionsProviders.length > 0 && (
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
                        isMoreOptionsOpen ? "rotate-180" : ""
                      }`}
                    />
                  </Button>
                </CollapsibleTrigger>
              </div>
              <CollapsibleContent className="flex flex-col items-center space-y-3 pt-3">
                {moreOptionsProviders.includes("google") && (
                  <ProviderButton
                    provider="google"
                    onClick={() => handleOAuthSignIn("google")}
                    isLoading={loadingProvider === "google"}
                  />
                )}
                {moreOptionsProviders.includes("apple") && (
                  <ProviderButton
                    provider="apple"
                    onClick={() => handleOAuthSignIn("apple")}
                    isLoading={loadingProvider === "apple"}
                  />
                )}
                {moreOptionsProviders.includes("email") && (
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
                        className="rounded-full"
                      />
                    </div>
                    <ProviderButton
                      provider="email"
                      type="submit"
                      onClick={() => {}}
                      isLoading={loadingProvider === "email"}
                    />
                  </form>
                )}
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* Terms and Privacy Footer - Hidden during OTP */}
          {!showOtpInput && (
            <div className="pt-4">
              <p className="text-muted-foreground text-center text-xs">
                By continuing, you agree to our{" "}
                <a
                  href="https://wealthfolio.app/legal/terms-of-use"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="hover:text-foreground underline underline-offset-4"
                >
                  Terms of Use
                </a>{" "}
                and{" "}
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
          )}
        </CardContent>
      </Card>

      {/* Manage Account Card */}
      <Card className="border-dashed">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <Icons.Settings className="text-muted-foreground mt-0.5 h-5 w-5" />
              <div>
                <p className="text-sm font-medium">Manage My Wealthfolio Connect Account</p>
                <p className="text-muted-foreground text-sm">
                  Update your profile, manage subscriptions, and configure sync settings.
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(WEALTHFOLIO_CONNECT_PORTAL_URL, "_blank")}
            >
              <Icons.ExternalLink className="mr-2 h-4 w-4" />
              Open
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
