import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import * as z from "zod";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "sonner";

const languageFormSchema = z.object({
  language: z.string({ required_error: "Please select a language." }),
});

type LanguageFormValues = z.infer<typeof languageFormSchema>;

export function LanguageForm() {
  const { i18n, t } = useTranslation("settings");

  // Get current language or "auto" if using browser detection
  const currentLanguage = localStorage.getItem("i18nextLng") || "auto";

  const languages = [
    { value: "auto", label: t("language_auto") },
    { value: "en", label: "English" },
    { value: "fr", label: "Français (French)" },
  ];

  const defaultValues: Partial<LanguageFormValues> = {
    language: currentLanguage,
  };

  const form = useForm<LanguageFormValues>({
    resolver: zodResolver(languageFormSchema),
    defaultValues,
    values: { language: currentLanguage },
  });

  async function onSubmit(data: LanguageFormValues) {
    try {
      if (data.language === "auto") {
        // Remove the stored language to allow browser detection
        localStorage.removeItem("i18nextLng");
        // Detect from navigator
        const browserLang = navigator.language.split("-")[0];
        const detectedLang = ["en", "fr"].includes(browserLang) ? browserLang : "en";
        await i18n.changeLanguage(detectedLang);
      } else {
        await i18n.changeLanguage(data.language);
      }
      toast.success(t("language_updated"));
    } catch (error) {
      console.error("Failed to update language:", error);
      toast.error(t("language_update_failed"));
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <FormField
          control={form.control}
          name="language"
          render={({ field }) => (
            <FormItem className="flex flex-col">
              <FormControl className="w-[300px]">
                <Select onValueChange={field.onChange} value={field.value}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("language")} />
                  </SelectTrigger>
                  <SelectContent>
                    {languages.map((lang) => (
                      <SelectItem key={lang.value} value={lang.value}>
                        {lang.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit">{t("save_settings")}</Button>
      </form>
    </Form>
  );
}

export function LanguageSettings() {
  const { t } = useTranslation("settings");

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="text-lg">{t("language")}</CardTitle>
          <CardDescription>{t("language_description")}</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <LanguageForm />
      </CardContent>
    </Card>
  );
}
