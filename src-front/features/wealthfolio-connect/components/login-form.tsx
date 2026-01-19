import { isDesktop, openUrlInBrowser } from "@/adapters";
import { getPreferredProvider, savePreferredProvider } from "@/lib/cookie-utils";
import { QueryKeys } from "@/lib/query-keys";
import { Alert, AlertDescription } from "@wealthfolio/ui/components/ui/alert";
import { Button } from "@wealthfolio/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@wealthfolio/ui/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@wealthfolio/ui/components/ui/collapsible";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { Input } from "@wealthfolio/ui/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@wealthfolio/ui/components/ui/input-otp";
import { Label } from "@wealthfolio/ui/components/ui/label";
import { Separator } from "@wealthfolio/ui/components/ui/separator";
import { Skeleton } from "@wealthfolio/ui/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useWealthfolioConnect } from "../providers/wealthfolio-connect-provider";
import { getSubscriptionPlansPublic } from "../services/broker-service";
import type { SubscriptionPlan } from "../types";
import { ProviderButton } from "./provider-button";

// OAuth is only available on desktop/mobile (Tauri) where we can handle deep links
// Web (self-hosted) uses email OTP only since we can't register all possible redirect URLs
const isNativeApp = isDesktop;

type Provider = "google" | "email";

// ─────────────────────────────────────────────────────────────────────────────
// Features Section
// ─────────────────────────────────────────────────────────────────────────────

const features = [
  {
    icon: Icons.CloudSync2,
    title: "Broker Sync",
    description: "Auto-sync transactions daily",
    color: "orange",
  },
  {
    icon: Icons.Devices,
    title: "Device Sync",
    description: "End-to-end encrypted sync",
    color: "green",
  },
  {
    icon: Icons.Users,
    title: "Household",
    description: "Shared family portfolio view",
    color: "blue",
  },
];

const featureColors = {
  orange: {
    bg: "bg-orange-100 dark:bg-orange-900/30",
    icon: "text-orange-600 dark:text-orange-400",
  },
  green: {
    bg: "bg-green-100 dark:bg-green-900/30",
    icon: "text-green-600 dark:text-green-400",
  },
  blue: {
    bg: "bg-blue-100 dark:bg-blue-900/30",
    icon: "text-blue-600 dark:text-blue-400",
  },
};

function FeaturesSection() {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-3">
      {features.map((feature) => {
        const colors = featureColors[feature.color as keyof typeof featureColors];
        return (
          <div
            key={feature.title}
            className="bg-muted/30 flex items-center gap-3 rounded-lg border p-3 sm:flex-col sm:gap-2 sm:text-center"
          >
            <div
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${colors.bg}`}
            >
              <feature.icon className={`h-4 w-4 ${colors.icon}`} />
            </div>
            <div>
              <p className="text-xs font-medium">{feature.title}</p>
              <p className="text-muted-foreground text-[10px]">{feature.description}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Plans Preview Section
// ─────────────────────────────────────────────────────────────────────────────

function formatPrice(price: number): string {
  return `$${price.toFixed(2)}`;
}

function formatConnections(connections: number | "unlimited"): string {
  if (connections === "unlimited") return "Unlimited";
  return `${connections} connections`;
}

function formatUsers(householdSize: number): string {
  return householdSize === 1 ? "1 user" : `${householdSize} users`;
}

function PlanCard({ plan }: { plan: SubscriptionPlan }) {
  const isPopular = plan.badge === "Popular";

  return (
    <div
      className={`relative rounded-lg border p-3 ${
        isPopular ? "border-primary bg-primary/5" : "bg-muted/30"
      }`}
    >
      {isPopular && (
        <span className="bg-primary text-primary-foreground absolute -top-2 left-3 rounded-full px-2 py-0.5 text-[9px] font-medium sm:left-1/2 sm:-translate-x-1/2">
          Popular
        </span>
      )}
      {/* Mobile: horizontal layout */}
      <div className="flex items-center justify-between sm:hidden">
        <div>
          <p className="text-sm font-semibold">{plan.name}</p>
          <p className="text-muted-foreground text-xs">
            {formatConnections(plan.limits.institutionConnections)} ·{" "}
            {formatUsers(plan.limits.householdSize)}
          </p>
        </div>
        <div className="text-right">
          <span className="text-lg font-bold">{formatPrice(plan.pricing.monthly)}</span>
          <span className="text-muted-foreground text-xs">/mo</span>
        </div>
      </div>
      {/* Desktop: vertical layout */}
      <div className="hidden text-center sm:block">
        <p className="text-xs font-semibold">{plan.name}</p>
        <p className="mt-1 text-lg font-bold">{formatPrice(plan.pricing.monthly)}</p>
        <p className="text-muted-foreground text-[10px]">/month</p>
        <div className="mt-2 space-y-0.5">
          <p className="text-muted-foreground text-[10px]">
            {formatConnections(plan.limits.institutionConnections)}
          </p>
          <p className="text-muted-foreground text-[10px]">
            {formatUsers(plan.limits.householdSize)}
          </p>
        </div>
      </div>
    </div>
  );
}

function PlansPreviewSkeleton() {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-4 text-center">
          <Skeleton className="mx-auto h-4 w-48" />
          <Skeleton className="mx-auto mt-2 h-3 w-56" />
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-muted/30 rounded-lg border p-3">
              <div className="hidden text-center sm:block">
                <Skeleton className="mx-auto h-3 w-16" />
                <Skeleton className="mx-auto mt-2 h-6 w-12" />
                <Skeleton className="mx-auto mt-1 h-2 w-10" />
                <div className="mt-2 space-y-1">
                  <Skeleton className="mx-auto h-2 w-20" />
                  <Skeleton className="mx-auto h-2 w-12" />
                </div>
              </div>
              <div className="flex items-center justify-between sm:hidden">
                <div className="space-y-1">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-3 w-32" />
                </div>
                <Skeleton className="h-6 w-16" />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function PlansPreviewSection() {
  const { data, isLoading, error } = useQuery({
    queryKey: [QueryKeys.SUBSCRIPTION_PLANS_PUBLIC],
    queryFn: getSubscriptionPlansPublic,
    staleTime: 10 * 60 * 1000, // 10 minutes
    retry: 2,
  });

  if (isLoading) {
    return <PlansPreviewSkeleton />;
  }

  // If error or no plans, don't show the section (fail silently)
  if (error || !data?.plans?.length) {
    return null;
  }

  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-4 text-center">
          <h3 className="text-sm font-semibold">Simple, transparent pricing</h3>
          <p className="text-muted-foreground text-xs">
            Choose a plan that fits your needs. Cancel anytime.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {data.plans.map((plan) => (
            <PlanCard key={plan.id} plan={plan} />
          ))}
        </div>

        <div className="mt-4 flex items-center justify-center">
          <Button
            variant="link"
            size="sm"
            className="text-muted-foreground h-auto p-0 text-xs"
            onClick={() => openUrlInBrowser("https://wealthfolio.app/connect/")}
          >
            Compare all features
            <Icons.ArrowRight className="ml-1 h-3 w-3" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

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
    // Web (self-hosted): only email OTP is available
    if (!isNativeApp) {
      return ["email"];
    }

    // Native app: if user has a preference, show it first
    if (preferredProvider) {
      return [preferredProvider];
    }

    // Default: show Google only
    return ["google"];
  };

  // Determine which providers to show in "More options"
  const getMoreOptionsProviders = (): Provider[] => {
    // Web (self-hosted): no additional options
    if (!isNativeApp) {
      return [];
    }

    const topProviders = getTopProviders();
    const allProviders: Provider[] = ["google", "email"];
    return allProviders.filter((p) => !topProviders.includes(p));
  };

  const topProviders = getTopProviders();
  const moreOptionsProviders = getMoreOptionsProviders();

  const handleOAuthSignIn = async (provider: "google") => {
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
      const errorMessage = err instanceof Error ? err.message : "";
      // Check for OTP expired/invalid error and provide a more user-friendly message
      const isOtpExpired =
        errorMessage.toLowerCase().includes("expired") ||
        errorMessage.toLowerCase().includes("invalid");
      const message = isOtpExpired
        ? "Code expired or invalid. Please request a new code."
        : errorMessage || "Invalid code. Please try again.";
      setLocalError(message);
      setOtpCode(""); // Clear OTP on error
    } finally {
      setLoadingProvider(null);
    }
  };

  const handleResendCode = async () => {
    setLocalError(null);
    clearError();
    setLoadingProvider("email");

    try {
      await signInWithMagicLink(pendingEmail);
      setSuccessMessage("A new code has been sent to your email.");
      setOtpCode(""); // Clear OTP input
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to resend code.";
      setLocalError(message);
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
      {/* Features Grid */}
      <FeaturesSection />

      {/* Sign In Card */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-center text-base font-medium">Get started</CardTitle>
          <CardDescription className="text-center">
            Sign in to connect your broker accounts
          </CardDescription>
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
                  variant="default"
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
                <div className="flex items-center gap-2">
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
                  <span className="text-muted-foreground">•</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleResendCode}
                    disabled={loadingProvider === "email"}
                    className="text-muted-foreground"
                  >
                    Resend code
                  </Button>
                </div>
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
                    isLastUsed={topProviders.length > 1 && preferredProvider === "google"}
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
                      isLastUsed={topProviders.length > 1 && preferredProvider === "email"}
                      variant="default"
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
                  <Button type="button" variant="ghost" className="gap-2" disabled={isLoading}>
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
                {moreOptionsProviders.includes("email") && (
                  <form
                    onSubmit={handleMagicLinkSignIn}
                    className="flex w-full max-w-sm flex-col items-center space-y-3"
                  >
                    <div className="w-full space-y-2">
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
                  href="https://wealthfolio.app/connect/legal/terms-of-use"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="hover:text-foreground underline underline-offset-4"
                >
                  Terms of Use
                </a>{" "}
                and{" "}
                <a
                  href="https://wealthfolio.app/connect/legal/privacy-policy"
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

      {/* Privacy Footnote */}
      <p className="text-muted-foreground text-center text-xs">
        Your portfolio data never leaves your device. Connect uses secure aggregators to sync
        transactions directly to your local database.
      </p>
    </div>
  );
}
