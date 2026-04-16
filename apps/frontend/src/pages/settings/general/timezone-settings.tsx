import { zodResolver } from "@hookform/resolvers/zod";
import type { TFunction } from "i18next";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import * as z from "zod";

import { Button } from "@wealthfolio/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@wealthfolio/ui/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@wealthfolio/ui/components/ui/form";
import { useSettingsContext } from "@/lib/settings-provider";
import { TimezoneInput } from "./timezone-input";

function createTimezoneFormSchema(t: TFunction) {
  return z.object({
    timezone: z.string().min(1, t("settings.timezone.validation.required")),
  });
}

type TimezoneFormValues = z.infer<ReturnType<typeof createTimezoneFormSchema>>;

const TIMEZONE_FALLBACKS = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Tokyo",
  "Asia/Singapore",
  "Australia/Sydney",
];

function getSupportedTimezones(): string[] {
  const supportedValuesOf = (
    Intl as unknown as {
      supportedValuesOf?: (key: "timeZone") => string[];
    }
  ).supportedValuesOf;

  const rawValues: string[] =
    typeof supportedValuesOf === "function" ? supportedValuesOf("timeZone") : TIMEZONE_FALLBACKS;

  const merged = rawValues.includes("UTC") ? rawValues : ["UTC", ...rawValues];
  return Array.from(new Set(merged)).sort((a, b) => a.localeCompare(b));
}

export function detectBrowserTimezone(): string {
  const detected = Intl.DateTimeFormat().resolvedOptions().timeZone?.trim();
  if (!detected) {
    return "UTC";
  }

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: detected }).format(new Date());
    return detected;
  } catch {
    return "UTC";
  }
}

export function resolveInitialTimezone(configuredTimezone: string | null | undefined): string {
  const configured = configuredTimezone?.trim();
  if (configured && configured.length > 0) {
    return configured;
  }

  return "";
}

export function TimezoneSettings() {
  const { t } = useTranslation("common");
  const { settings, updateSettings } = useSettingsContext();
  const browserTimezone = useMemo(() => detectBrowserTimezone(), []);
  const initialTimezone = resolveInitialTimezone(settings?.timezone);
  const timezoneFormSchema = useMemo(() => createTimezoneFormSchema(t), [t]);
  const timezones = useMemo(() => {
    const supported = getSupportedTimezones();
    // Put detected browser timezone first for easy access
    const filtered = supported.filter((tz) => tz !== browserTimezone);
    return [browserTimezone, ...filtered];
  }, [browserTimezone]);

  const form = useForm<TimezoneFormValues>({
    resolver: zodResolver(timezoneFormSchema),
    defaultValues: {
      timezone: initialTimezone,
    },
    values: {
      timezone: initialTimezone,
    },
  });

  async function onSubmit(data: TimezoneFormValues) {
    await updateSettings({ timezone: data.timezone });
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="text-lg">{t("settings.timezone.title")}</CardTitle>
          <CardDescription>{t("settings.timezone.description")}</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="timezone"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormControl className="w-full max-w-[360px]">
                    <TimezoneInput
                      value={field.value}
                      onChange={field.onChange}
                      timezones={timezones}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit">{t("settings.timezone.save")}</Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
