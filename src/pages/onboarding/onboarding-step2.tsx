import { Card, CardContent } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useSettingsContext } from "@/lib/settings-provider";
import { zodResolver } from "@hookform/resolvers/zod";
import { Icons } from "@wealthfolio/ui";
import { worldCurrencies } from "@wealthfolio/ui/lib/currencies";
import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { useForm } from "react-hook-form";
import * as z from "zod";

const onboardingSettingsSchema = z.object({
  baseCurrency: z
    .string({ required_error: "Please select a base currency." })
    .min(1, "Please select a base currency."),
  theme: z.enum(["light", "dark", "system"], { required_error: "Please select a theme." }),
});

function detectDefaultCurrency(): string | undefined {
  if (typeof navigator === "undefined") return undefined; // Default SSR/Node
  const lang = navigator.language || navigator.languages[0];
  if (lang.startsWith("en-GB")) return "GBP";
  if (lang.startsWith("en-US")) return "USD";
  if (lang.startsWith("en-CA")) return "CAD";
  if (lang.startsWith("en-AU")) return "AUD";
  if (lang.startsWith("de")) return "EUR";
  if (lang.startsWith("fr")) return "EUR";
  if (lang.startsWith("es")) return "EUR";
  if (lang.startsWith("it")) return "EUR";
  if (lang.startsWith("ja")) return "JPY";
  if (lang.startsWith("zh")) return "CNY";
  if (lang.startsWith("ko")) return "KRW";
  if (lang.startsWith("ru")) return "RUB";
  if (lang.startsWith("nl")) return "EUR";
  if (lang.startsWith("pl")) return "EUR";
  if (lang.startsWith("pt")) return "EUR";
  if (lang.startsWith("sv")) return "EUR";
  if (lang.startsWith("tr")) return "EUR";
  if (lang.startsWith("ar")) return "USD";
  if (lang.startsWith("hi")) return "INR";
  return undefined;
}

const popularCurrencies = ["USD", "CAD", "EUR", "GBP", "AUD", "CHF", "JPY"];

type OnboardingSettingsValues = z.infer<typeof onboardingSettingsSchema>;

export interface OnboardingStep2Handle {
  submitForm: () => void;
}

interface OnboardingStep2Props {
  onNext: () => void;
  onValidityChange: (isValid: boolean) => void;
}

export const OnboardingStep2 = forwardRef<OnboardingStep2Handle, OnboardingStep2Props>(
  ({ onNext, onValidityChange }, ref) => {
    const { settings, updateSettings } = useSettingsContext();
    const [initialValuesSet, setInitialValuesSet] = useState(false);
    const [showCurrencySearch, setShowCurrencySearch] = useState(false);
    const [currencySearch, setCurrencySearch] = useState("");

    const form = useForm<OnboardingSettingsValues>({
      resolver: zodResolver(onboardingSettingsSchema),
    });

    const filteredCurrencies = worldCurrencies.filter(
      (curr) =>
        curr.value.toLowerCase().includes(currencySearch.toLowerCase()) ||
        curr.label.toLowerCase().includes(currencySearch.toLowerCase()),
    );

    const currentCurrency = form.watch("baseCurrency");

    function handleCurrencySelect(currencyCode: string) {
      form.setValue("baseCurrency", currencyCode, { shouldValidate: true, shouldDirty: true });
      setShowCurrencySearch(false);
      setCurrencySearch("");
    }

    useEffect(() => {
      onValidityChange(form.formState.isValid);
    }, [form.formState.isValid, onValidityChange]);

    useImperativeHandle(ref, () => ({
      submitForm() {
        form.handleSubmit(onSubmit)();
      },
    }));

    useEffect(() => {
      if (!initialValuesSet) {
        form.reset({
          baseCurrency: settings?.baseCurrency ?? detectDefaultCurrency() ?? "",
          theme: (settings?.theme as OnboardingSettingsValues["theme"]) ?? undefined,
        });
        setInitialValuesSet(true);
      }
    }, [form, settings, initialValuesSet]);

    async function onSubmit(data: OnboardingSettingsValues) {
      try {
        await updateSettings({
          baseCurrency: data.baseCurrency,
          theme: data.theme,
          onboardingCompleted: true,
        });
        onNext();
      } catch (error) {
        console.error("Failed to save onboarding settings:", error);
      }
    }

    return (
      <>
        <div className="space-y-3 sm:space-y-4">
          <div className="text-center">
            <p className="text-muted-foreground text-sm sm:text-base">
              Just a couple preferences to get you started
            </p>
          </div>
          <Card className="border-none bg-transparent">
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-16">
                  <FormField
                    control={form.control}
                    name="baseCurrency"
                    render={({ field }) => (
                      <FormItem>
                        <div className="mb-4 flex items-center gap-3">
                          <div className="bg-muted rounded-lg p-2">
                            <Icons.DollarSign className="text-muted-foreground h-5 w-5" />
                          </div>
                          <FormLabel className="text-xl font-semibold">Currency</FormLabel>
                        </div>
                        <FormControl>
                          <div className="grid grid-cols-3 gap-3 md:grid-cols-4">
                            {popularCurrencies.map((curr) => (
                              <button
                                key={curr}
                                type="button"
                                onClick={() => field.onChange(curr)}
                                className={`rounded-lg border-2 p-4 font-semibold transition-all ${
                                  field.value === curr
                                    ? "border-primary bg-primary/10"
                                    : "border-border hover:border-primary/50 hover:bg-accent"
                                }`}
                              >
                                {curr}
                              </button>
                            ))}
                            <button
                              type="button"
                              onClick={() => setShowCurrencySearch(true)}
                              className="border-border hover:border-primary/50 hover:bg-accent ring-offset-background focus-visible:ring-ring inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 text-sm font-medium whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0"
                            >
                              <Icons.Search className="size-5" />
                              Other
                            </button>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="theme"
                    render={({ field }) => (
                      <FormItem>
                        <div className="mb-4 flex items-center gap-3">
                          <div className="bg-muted rounded-lg p-2">
                            <Icons.Palette className="text-muted-foreground h-5 w-5" />
                          </div>
                          <FormLabel className="text-xl font-semibold">Theme</FormLabel>
                        </div>
                        <FormControl>
                          <div className="grid grid-cols-3 gap-4">
                            <button
                              type="button"
                              onClick={() => field.onChange("dark")}
                              className={`rounded-lg border-2 p-4 transition-all ${
                                field.value === "dark"
                                  ? "border-primary bg-primary/10"
                                  : "border-border hover:border-primary/50 hover:bg-accent"
                              }`}
                            >
                              <div className="flex flex-col items-center gap-3">
                                <div
                                  className={`rounded-full p-3 ${
                                    field.value === "dark"
                                      ? "bg-primary text-primary-foreground"
                                      : "bg-muted"
                                  }`}
                                >
                                  <Icons.Moon className="h-6 w-6" />
                                </div>
                                <span className="font-semibold">Dark</span>
                              </div>
                            </button>
                            <button
                              type="button"
                              onClick={() => field.onChange("light")}
                              className={`rounded-lg border-2 p-4 transition-all ${
                                field.value === "light"
                                  ? "border-primary bg-primary/10"
                                  : "border-border hover:border-primary/50 hover:bg-accent"
                              }`}
                            >
                              <div className="flex flex-col items-center gap-3">
                                <div
                                  className={`rounded-full p-3 ${
                                    field.value === "light"
                                      ? "bg-primary text-primary-foreground"
                                      : "bg-muted"
                                  }`}
                                >
                                  <Icons.Sun className="h-6 w-6" />
                                </div>
                                <span className="font-semibold">Light</span>
                              </div>
                            </button>
                            <button
                              type="button"
                              onClick={() => field.onChange("system")}
                              className={`rounded-lg border-2 p-4 transition-all ${
                                field.value === "system"
                                  ? "border-primary bg-primary/10"
                                  : "border-border hover:border-primary/50 hover:bg-accent"
                              }`}
                            >
                              <div className="flex flex-col items-center gap-3">
                                <div
                                  className={`rounded-full p-3 ${
                                    field.value === "system"
                                      ? "bg-primary text-primary-foreground"
                                      : "bg-muted"
                                  }`}
                                >
                                  <Icons.Monitor className="h-6 w-6" />
                                </div>
                                <span className="font-semibold">System</span>
                              </div>
                            </button>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>

        {showCurrencySearch && (
          <div className="bg-background/80 animate-in fade-in fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm duration-200">
            <Card className="w-full max-w-md border shadow-lg">
              <div className="p-6">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-xl font-bold">Select Currency</h3>
                  <button
                    onClick={() => {
                      setShowCurrencySearch(false);
                      setCurrencySearch("");
                    }}
                    className="hover:bg-accent rounded-lg p-2 transition-colors"
                  >
                    <Icons.Close className="h-5 w-5" />
                  </button>
                </div>

                <div className="relative mb-4">
                  <Icons.Search className="text-muted-foreground absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 transform" />
                  <Input
                    type="text"
                    placeholder="Search currencies..."
                    value={currencySearch}
                    onChange={(e) => setCurrencySearch(e.target.value)}
                    className="pl-10"
                    autoFocus
                  />
                </div>

                <div className="max-h-96 space-y-1 overflow-y-auto pr-2">
                  {filteredCurrencies.map((curr) => (
                    <button
                      key={curr.value}
                      onClick={() => handleCurrencySelect(curr.value)}
                      className={`flex w-full items-center justify-between rounded-lg p-3 transition-all ${
                        currentCurrency === curr.value ? "bg-primary/10" : "hover:bg-accent"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="text-left">
                          <div className="font-semibold">{curr.value}</div>
                          <div className="text-muted-foreground text-sm">{curr.label}</div>
                        </div>
                      </div>
                      {currentCurrency === curr.value && (
                        <Icons.CheckCircle className="text-primary h-5 w-5" />
                      )}
                    </button>
                  ))}
                  {filteredCurrencies.length === 0 && (
                    <div className="text-muted-foreground py-8 text-center">
                      No currencies found
                    </div>
                  )}
                </div>
              </div>
            </Card>
          </div>
        )}
      </>
    );
  },
);

OnboardingStep2.displayName = "OnboardingStep2";
