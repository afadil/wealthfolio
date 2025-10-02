import { ThemeSelector } from "@/components/theme-selector";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Icons } from "@/components/ui/icons";
import { useSettingsContext } from "@/lib/settings-provider";
import { zodResolver } from "@hookform/resolvers/zod";
import { CurrencyInput } from "@wealthfolio/ui";
import { motion } from "framer-motion";
import React, { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import * as z from "zod";

// Onboarding schema with system theme option
const onboardingSettingsSchema = z.object({
  baseCurrency: z.string({ required_error: "Please select a base currency." }),
  theme: z.enum(["light", "dark", "system"], { required_error: "Please select a theme." }),
});

// Helper for locale detection (simple example)
function detectDefaultCurrency(): string {
  if (typeof navigator === "undefined") return "USD"; // Default SSR/Node
  const lang = navigator.language || navigator.languages[0];
  if (lang.startsWith("en-GB")) return "GBP";
  if (lang.startsWith("en-US")) return "USD";
  if (lang.startsWith("en-CA")) return "CAD";
  if (lang.startsWith("en-AU")) return "AUD";
  if (lang.startsWith("de")) return "EUR"; // Simplified German -> EUR
  if (lang.startsWith("fr")) return "EUR"; // Simplified French -> EUR
  if (lang.startsWith("es")) return "EUR"; // Simplified Spanish -> EUR
  if (lang.startsWith("it")) return "EUR"; // Simplified Italian -> EUR
  if (lang.startsWith("ja")) return "JPY"; // Simplified Japanese -> JPY
  if (lang.startsWith("zh")) return "CNY"; // Simplified Chinese -> CNY
  if (lang.startsWith("ko")) return "KRW"; // Simplified Korean -> KRW
  if (lang.startsWith("ru")) return "RUB"; // Simplified Russian -> RUB
  if (lang.startsWith("nl")) return "EUR"; // Simplified Dutch -> EUR
  if (lang.startsWith("pl")) return "EUR"; // Simplified Polish -> EUR
  if (lang.startsWith("pt")) return "EUR"; // Simplified Portuguese -> EUR
  if (lang.startsWith("sv")) return "EUR"; // Simplified Swedish -> EUR
  if (lang.startsWith("tr")) return "EUR"; // Simplified Turkish -> EUR
  if (lang.startsWith("ar")) return "USD"; // Simplified Arabic -> USD
  if (lang.startsWith("hi")) return "INR"; // Simplified Hindi -> INR
  return "USD"; // Fallback
}

// Helper for OS theme detection
function detectDefaultTheme(): "light" | "dark" {
  if (
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  ) {
    return "dark";
  }
  return "light";
}

type OnboardingSettingsValues = z.infer<typeof onboardingSettingsSchema>;

interface OnboardingStep2Props {
  onNext: () => void;
  onBack: () => void;
}

export const OnboardingStep2: React.FC<OnboardingStep2Props> = ({ onNext, onBack }) => {
  const { settings, updateSettings } = useSettingsContext();
  const [initialValuesSet, setInitialValuesSet] = useState(false);

  // Use detected values for initial form state
  const form = useForm<OnboardingSettingsValues>({
    resolver: zodResolver(onboardingSettingsSchema),
  });

  // Set defaults based on detection after mount
  useEffect(() => {
    if (!initialValuesSet) {
      form.reset({
        baseCurrency: settings?.baseCurrency || detectDefaultCurrency(),
        theme: (settings?.theme as OnboardingSettingsValues["theme"]) || detectDefaultTheme(),
      });
      setInitialValuesSet(true);
    }
  }, [form, settings, initialValuesSet]);

  async function onSubmit(data: OnboardingSettingsValues) {
    try {
      await updateSettings({ baseCurrency: data.baseCurrency, theme: data.theme });
      await updateSettings({ onboardingCompleted: true });
      onNext();
    } catch (error) {
      console.error("Failed to save onboarding settings:", error);
    }
  }

  return (
    <div className="space-y-2 px-4 md:px-12 lg:px-16 xl:px-20">
      <h1 className="mb-2 text-2xl font-bold md:text-3xl">Settings</h1>
      <p className="text-muted-foreground pb-4 text-sm md:pb-6 md:text-base">
        Just a couple preferences to get you started
      </p>
      <Card>
        <CardContent className="p-4 md:p-8">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8 md:space-y-12">
              {/* --- Base Currency Field --- */}
              <FormField
                control={form.control}
                name="baseCurrency"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Setup your base currency</FormLabel>
                    <FormControl className="mt-2 w-full max-w-[300px]">
                      <CurrencyInput value={field.value} onChange={field.onChange} autoFocus />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* --- Theme Field --- */}
              <FormField
                control={form.control}
                name="theme"
                render={({ field }) => (
                  <FormItem className="space-y-1">
                    <FormLabel>Select your preferred theme</FormLabel>
                    <FormMessage />
                    <FormControl>
                      <ThemeSelector
                        value={field.value}
                        onChange={field.onChange}
                        className="max-w-md pt-2"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </form>
          </Form>
        </CardContent>
      </Card>
      <div className="flex flex-col gap-4 pt-4 sm:flex-row sm:justify-between">
        <Button variant="outline" onClick={onBack} type="button" className="w-full sm:w-auto">
          <Icons.ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <div className="flex items-center space-x-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: form.formState.isValid ? 1 : 0 }}
            transition={{ duration: 0.3 }}
            className="w-full sm:w-auto"
          >
            <Button
              onClick={form.handleSubmit(onSubmit)}
              type="button"
              disabled={!form.formState.isValid}
              className="w-full sm:w-auto"
            >
              Next: Final Steps
              <Icons.ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </motion.div>
        </div>
      </div>
    </div>
  );
};
