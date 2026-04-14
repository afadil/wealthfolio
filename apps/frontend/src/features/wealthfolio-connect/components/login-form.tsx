import { isDesktop } from "@/adapters";
import { ExternalLink } from "@/components/external-link";
import { getPreferredProvider, savePreferredProvider } from "@/lib/cookie-utils";
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
import { useEffect, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { useWealthfolioConnect } from "../providers/wealthfolio-connect-provider";
import { ProviderButton } from "./provider-button";

const isNativeApp = isDesktop;

type Provider = "google" | "email";

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
  const { t } = useTranslation("common");
  const features = [
    {
      icon: Icons.CloudSync2,
      titleKey: "connect.marketing.feature_broker_title",
      descKey: "connect.marketing.feature_broker_desc",
      color: "orange" as const,
    },
    {
      icon: Icons.Devices,
      titleKey: "connect.marketing.feature_device_title",
      descKey: "connect.marketing.feature_device_desc",
      color: "green" as const,
    },
    {
      icon: Icons.Users,
      titleKey: "connect.marketing.feature_household_title",
      descKey: "connect.marketing.feature_household_desc",
      color: "blue" as const,
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-3">
      {features.map((feature) => {
        const colors = featureColors[feature.color];
        return (
          <div
            key={feature.titleKey}
            className="bg-muted/30 flex items-center gap-3 rounded-lg border p-3 sm:flex-col sm:gap-2 sm:text-center"
          >
            <div
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${colors.bg}`}
            >
              <feature.icon className={`h-4 w-4 ${colors.icon}`} />
            </div>
            <div>
              <p className="text-xs font-medium">{t(feature.titleKey)}</p>
              <p className="text-muted-foreground text-[10px]">{t(feature.descKey)}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function LoginForm() {
  const { t } = useTranslation("common");
  const { signInWithOAuth, signInWithMagicLink, verifyOtp, error, clearError, isLoading } =
    useWealthfolioConnect();

  const [email, setEmail] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [loadingProvider, setLoadingProvider] = useState<Provider | null>(null);
  const [preferredProvider, setPreferredProvider] = useState<Provider | null>(null);
  const [isMoreOptionsOpen, setIsMoreOptionsOpen] = useState(false);

  const [showOtpInput, setShowOtpInput] = useState(false);
  const [pendingEmail, setPendingEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");

  useEffect(() => {
    const savedProvider = getPreferredProvider();
    setPreferredProvider(savedProvider);
  }, []);

  const getTopProviders = (): Provider[] => {
    if (!isNativeApp) {
      return ["email"];
    }
    if (preferredProvider) {
      return [preferredProvider];
    }
    return ["google"];
  };

  const getMoreOptionsProviders = (): Provider[] => {
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
      savePreferredProvider(provider);
    } catch (err) {
      const message = err instanceof Error ? err.message : t("connect.login.error_signin_failed");
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
      setLocalError(t("connect.login.error_email_required"));
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setLocalError(t("connect.login.error_email_invalid"));
      return;
    }

    setLoadingProvider("email");

    try {
      await signInWithMagicLink(email);
      savePreferredProvider("email");
      setPendingEmail(email);
      setShowOtpInput(true);
      setEmail("");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : t("connect.login.error_magic_link_failed");
      setLocalError(message);
    } finally {
      setLoadingProvider(null);
    }
  };

  const handleOtpVerify = async () => {
    if (otpCode.length !== 6) {
      setLocalError(t("connect.login.error_otp_incomplete"));
      return;
    }

    setLocalError(null);
    clearError();
    setLoadingProvider("email");

    try {
      await verifyOtp(pendingEmail, otpCode);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "";
      const isOtpExpired =
        errorMessage.toLowerCase().includes("expired") ||
        errorMessage.toLowerCase().includes("invalid");
      const message = isOtpExpired
        ? t("connect.login.error_otp_expired")
        : errorMessage || t("connect.login.error_otp_generic");
      setLocalError(message);
      setOtpCode("");
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
      setSuccessMessage(t("connect.login.success_code_resent"));
      setOtpCode("");
    } catch (err) {
      const message = err instanceof Error ? err.message : t("connect.login.error_resend_failed");
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
      <FeaturesSection />

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-center text-base font-medium">{t("connect.login.card_title")}</CardTitle>
          <CardDescription className="text-center">{t("connect.login.card_description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {displayError && (
            <Alert variant="destructive">
              <Icons.AlertCircle className="h-4 w-4" />
              <AlertDescription>{displayError}</AlertDescription>
            </Alert>
          )}

          {successMessage && (
            <Alert>
              <Icons.CheckCircle className="h-4 w-4" />
              <AlertDescription>{successMessage}</AlertDescription>
            </Alert>
          )}

          {showOtpInput ? (
            <div className="flex flex-col items-center space-y-4">
              <div className="text-center">
                <p className="text-sm font-medium">{t("connect.login.otp_title")}</p>
                <p className="text-muted-foreground text-sm">
                  {t("connect.login.otp_sent_prefix")}{" "}
                  <span className="font-medium">{pendingEmail}</span>
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
                      {t("connect.login.verifying")}
                    </>
                  ) : (
                    t("connect.login.verify")
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
                    {t("connect.login.back_to_signin")}
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
                    {t("connect.login.resend_code")}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <>
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
                      <Label htmlFor="email">{t("connect.login.label_email")}</Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder={t("connect.login.placeholder_email")}
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        autoComplete="email"
                        className="rounded-full"
                      />
                    </div>
                    <ProviderButton
                      provider="email"
                      type="submit"
                      onClick={() => undefined}
                      isLoading={loadingProvider === "email"}
                      isLastUsed={topProviders.length > 1 && preferredProvider === "email"}
                      variant="default"
                    />
                  </form>
                )}
              </div>

              {moreOptionsProviders.length > 0 && (
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <Separator className="mx-auto max-w-sm" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background text-muted-foreground px-2">
                      {t("connect.login.divider_or")}
                    </span>
                  </div>
                </div>
              )}
            </>
          )}

          {!showOtpInput && moreOptionsProviders.length > 0 && (
            <Collapsible open={isMoreOptionsOpen} onOpenChange={setIsMoreOptionsOpen}>
              <div className="flex justify-center">
                <CollapsibleTrigger asChild>
                  <Button type="button" variant="ghost" className="gap-2" disabled={isLoading}>
                    <span className="text-muted-foreground text-sm">{t("connect.login.more_options")}</span>
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
                      <Label htmlFor="more-email">{t("connect.login.label_email")}</Label>
                      <Input
                        id="more-email"
                        type="email"
                        placeholder={t("connect.login.placeholder_email")}
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        autoComplete="email"
                        className="rounded-full"
                      />
                    </div>
                    <ProviderButton
                      provider="email"
                      type="submit"
                      onClick={() => undefined}
                      isLoading={loadingProvider === "email"}
                    />
                  </form>
                )}
              </CollapsibleContent>
            </Collapsible>
          )}

          {!showOtpInput && (
            <div className="pt-4">
              <p className="text-muted-foreground text-center text-xs">
                <Trans
                  i18nKey="connect.login.terms"
                  components={{
                    0: (
                      <ExternalLink
                        href="https://wealthfolio.app/connect/legal/terms-of-use"
                        className="hover:text-foreground underline underline-offset-4"
                      />
                    ),
                    1: (
                      <ExternalLink
                        href="https://wealthfolio.app/connect/legal/privacy-policy"
                        className="hover:text-foreground underline underline-offset-4"
                      />
                    ),
                  }}
                />
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-muted-foreground text-center text-xs">{t("connect.login.privacy_footnote")}</p>
    </div>
  );
}
