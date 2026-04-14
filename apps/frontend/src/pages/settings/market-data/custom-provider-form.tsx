import { useCallback, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

import { Button } from "@wealthfolio/ui/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@wealthfolio/ui/components/ui/form";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { Input } from "@wealthfolio/ui/components/ui/input";
import { Textarea } from "@wealthfolio/ui/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@wealthfolio/ui";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@wealthfolio/ui/components/ui/tabs";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@wealthfolio/ui/components/ui/collapsible";

import { useCreateCustomProvider, useUpdateCustomProvider } from "@/hooks/use-custom-providers";
import type {
  CustomProviderWithSources,
  NewCustomProviderSource,
} from "@/lib/types/custom-provider";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";

import { SourceConfigPanel } from "./source-config-panel";

function createSourceSchema(t: TFunction<"common">) {
  return z.object({
    format: z.enum(["json", "html", "html_table", "csv"]),
    url: z
      .string()
      .min(1, t("settings.market_data.custom_provider.validation.url_required"))
      .refine((val) => /^https?:\/\//i.test(val), {
        message: t("settings.market_data.custom_provider.validation.url_http_required"),
      }),
    pricePath: z
      .string()
      .min(1, t("settings.market_data.custom_provider.validation.price_path_required")),
    datePath: z.string().optional(),
    dateFormat: z.string().optional(),
    currencyPath: z.string().optional(),
    factor: z.coerce.number().optional(),
    invert: z.boolean().optional(),
    locale: z.string().optional(),
    headers: z
      .string()
      .optional()
      .refine(
        (val) => {
          if (!val || val.trim() === "") return true;
          try {
            JSON.parse(val);
            return true;
          } catch {
            return false;
          }
        },
        { message: t("settings.market_data.custom_provider.validation.headers_json_invalid") },
      ),
    highPath: z.string().optional(),
    lowPath: z.string().optional(),
    volumePath: z.string().optional(),
    defaultPrice: z.coerce.number().optional(),
    dateTimezone: z.string().optional(),
  });
}

function createFormSchema(t: TFunction<"common">) {
  const sourceSchema = createSourceSchema(t);
  return z.object({
    name: z.string().min(1, t("settings.market_data.custom_provider.validation.name_required")),
    code: z
      .string()
      .min(1, t("settings.market_data.custom_provider.validation.code_required"))
      .regex(
        /^[a-z0-9-]+$/,
        t("settings.market_data.custom_provider.validation.code_format"),
      ),
    description: z.string().optional(),
    priority: z.coerce.number().int().min(1).default(50),
    latestSource: sourceSchema,
    historicalEnabled: z.boolean(),
    historicalSource: sourceSchema.optional(),
  });
}

export type FormValues = z.infer<ReturnType<typeof createFormSchema>>;

function generateCode(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Extract a human-friendly name from a URL domain (e.g. "CoinGecko" from "https://api.coingecko.com/...") */
function nameFromUrl(url: string): string | null {
  try {
    const hostname = new URL(url).hostname;
    // Extract the main domain name (e.g., "euronext" from "live.euronext.com")
    const parts = hostname.split(".");
    // For "euronext.com" → "euronext", "live.euronext.com" → "euronext"
    const domain = parts.length >= 2 ? parts[parts.length - 2] : parts[0];
    if (!domain) return null;
    return domain.charAt(0).toUpperCase() + domain.slice(1);
  } catch {
    return null;
  }
}

interface CustomProviderFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  provider?: CustomProviderWithSources;
}

/**
 * Thin shell: renders the Dialog and keys the inner content so it
 * remounts (= full reset) whenever the dialog opens or the provider changes.
 */
export function CustomProviderForm({ open, onOpenChange, provider }: CustomProviderFormProps) {
  const [saving, setSaving] = useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && saving) return;
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="flex h-[90vh] max-h-[800px] w-[95vw] max-w-5xl flex-col overflow-hidden sm:h-[85vh]">
        {open && (
          <CustomProviderFormContent
            key={provider?.id ?? "__new__"}
            provider={provider}
            onOpenChange={onOpenChange}
            onSavingChange={setSaving}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function CustomProviderFormContent({
  provider,
  onOpenChange,
  onSavingChange,
}: {
  provider?: CustomProviderWithSources;
  onOpenChange: (open: boolean) => void;
  onSavingChange: (saving: boolean) => void;
}) {
  const { t } = useTranslation("common");
  const isEditing = !!provider;
  const { mutate: createProvider, isPending: isCreating } = useCreateCustomProvider();
  const { mutate: updateProvider, isPending: isUpdating } = useUpdateCustomProvider();
  const isSaving = isCreating || isUpdating;
  onSavingChange(isSaving);

  const latestSource = provider?.sources.find((s) => s.kind === "latest");
  const historicalSource = provider?.sources.find((s) => s.kind === "historical");
  const formSchema = useMemo(() => createFormSchema(t), [t]);

  const form = useForm<FormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(formSchema) as any,
    defaultValues: {
      name: provider?.name ?? "",
      code: provider?.id ?? "",
      description: provider?.description ?? "",
      priority: provider?.priority ?? 50,
      latestSource: {
        format: latestSource?.format ?? "json",
        url: latestSource?.url ?? "",
        pricePath: latestSource?.pricePath ?? "",
        datePath: latestSource?.datePath ?? "",
        dateFormat: latestSource?.dateFormat ?? "",
        currencyPath: latestSource?.currencyPath ?? "",
        factor: latestSource?.factor ?? undefined,
        invert: latestSource?.invert ?? false,
        locale: latestSource?.locale ?? "",
        headers: latestSource?.headers ?? "",
        highPath: latestSource?.highPath ?? "",
        lowPath: latestSource?.lowPath ?? "",
        volumePath: latestSource?.volumePath ?? "",
        defaultPrice: latestSource?.defaultPrice ?? undefined,
        dateTimezone: latestSource?.dateTimezone ?? "",
      },
      historicalEnabled: !!historicalSource,
      historicalSource: historicalSource
        ? {
            format: historicalSource.format ?? "json",
            url: historicalSource.url,
            pricePath: historicalSource.pricePath,
            datePath: historicalSource.datePath ?? "",
            dateFormat: historicalSource.dateFormat ?? "",
            currencyPath: historicalSource.currencyPath ?? "",
            factor: historicalSource.factor ?? undefined,
            invert: historicalSource.invert ?? false,
            locale: historicalSource.locale ?? "",
            headers: historicalSource.headers ?? "",
            highPath: historicalSource.highPath ?? "",
            lowPath: historicalSource.lowPath ?? "",
            volumePath: historicalSource.volumePath ?? "",
            defaultPrice: historicalSource.defaultPrice ?? undefined,
            dateTimezone: historicalSource.dateTimezone ?? "",
          }
        : undefined,
    },
  });

  const [nameManuallyEdited, setNameManuallyEdited] = useState(isEditing);
  const [codeManuallyEdited, setCodeManuallyEdited] = useState(isEditing);
  const [descriptionOpen, setDescriptionOpen] = useState(!!provider?.description);

  // Called by SourceConfigPanel when the URL input changes
  const handleUrlChange = useCallback(
    (url: string) => {
      if (isEditing) return;
      const derived = nameFromUrl(url);
      if (!derived) return;
      if (!nameManuallyEdited) {
        form.setValue("name", derived);
        if (!codeManuallyEdited) {
          form.setValue("code", generateCode(derived));
        }
      }
    },
    [isEditing, nameManuallyEdited, codeManuallyEdited, form],
  );

  const handleNameChange = (value: string, onChange: (v: string) => void) => {
    setNameManuallyEdited(true);
    onChange(value);
    if (!codeManuallyEdited && !isEditing) {
      form.setValue("code", generateCode(value));
    }
  };

  const handleSave = useCallback(
    (values: FormValues) => {
      const mapSource = (
        src: FormValues["latestSource"],
        kind: "latest" | "historical",
      ): NewCustomProviderSource => ({
        kind,
        format: src.format,
        url: src.url,
        pricePath: src.pricePath,
        datePath: src.datePath || undefined,
        dateFormat: src.dateFormat || undefined,
        currencyPath: src.currencyPath || undefined,
        factor: src.factor ?? undefined,
        invert: src.invert ?? undefined,
        locale: src.locale || undefined,
        headers: src.headers || undefined,
        highPath: src.highPath || undefined,
        lowPath: src.lowPath || undefined,
        volumePath: src.volumePath || undefined,
        defaultPrice: src.defaultPrice ?? undefined,
        dateTimezone: src.dateTimezone || undefined,
      });

      const sources: NewCustomProviderSource[] = [mapSource(values.latestSource, "latest")];

      if (values.historicalEnabled && values.historicalSource) {
        sources.push(mapSource(values.historicalSource, "historical"));
      }

      if (isEditing && provider) {
        updateProvider(
          {
            providerId: provider.id,
            payload: {
              name: values.name,
              description: values.description || undefined,
              priority: values.priority,
              sources,
            },
          },
          { onSuccess: () => onOpenChange(false) },
        );
      } else {
        createProvider(
          {
            code: values.code,
            name: values.name,
            description: values.description || undefined,
            priority: values.priority,
            sources,
          },
          { onSuccess: () => onOpenChange(false) },
        );
      }
    },
    [isEditing, provider, createProvider, updateProvider, onOpenChange],
  );

  const historicalEnabled = form.watch("historicalEnabled");

  return (
    <>
      <DialogHeader className="shrink-0">
        <DialogTitle>
          {isEditing
            ? t("settings.market_data.custom_provider.edit_title")
            : t("settings.market_data.custom_provider.add_title")}
        </DialogTitle>
        <DialogDescription>
          {t("settings.market_data.custom_provider.dialog_description")}
        </DialogDescription>
      </DialogHeader>

      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(handleSave, (errors) => {
            // Scroll to the first visible error
            if (errors.latestSource || errors.historicalSource) {
              // Source errors are at the top — scroll up
              document.getElementById("source-config-area")?.scrollTo({
                top: 0,
                behavior: "smooth",
              });
            } else if (errors.name || errors.code) {
              // Name/Code are at the bottom — scroll to them
              document.getElementById("provider-identity")?.scrollIntoView({
                behavior: "smooth",
                block: "center",
              });
            }
          })}
          className="flex min-h-0 flex-1 flex-col"
        >
          <Tabs defaultValue="latest" className="flex min-h-0 flex-1 flex-col">
            <TabsList className="w-full shrink-0">
              <TabsTrigger value="latest" className="flex-1">
                {t("settings.market_data.custom_provider.latest_price")}
              </TabsTrigger>
              <TabsTrigger value="historical" className="flex-1">
                {t("settings.market_data.custom_provider.historical")}
                <span className="text-muted-foreground ml-1 text-[10px] font-normal">
                  ({t("settings.market_data.custom_provider.optional")})
                </span>
              </TabsTrigger>
            </TabsList>

            {/* Scrollable content area */}
            <div id="source-config-area" className="min-h-0 flex-1 overflow-y-auto">
              <TabsContent value="latest" className="mt-3">
                <SourceConfigPanel
                  form={form}
                  prefix="latestSource"
                  onUrlChange={handleUrlChange}
                />
              </TabsContent>

              <TabsContent value="historical" className="mt-3">
                {!historicalEnabled ? (
                  <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-8">
                    <Icons.Clock className="text-muted-foreground/40 h-8 w-8" />
                    <div className="text-center">
                      <p className="text-muted-foreground text-sm">
                        {t("settings.market_data.custom_provider.historical_optional")}
                      </p>
                      <p className="text-muted-foreground mt-1 text-xs">
                        {t("settings.market_data.custom_provider.historical_optional_hint")}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        form.setValue("historicalEnabled", true);
                        form.setValue("historicalSource", {
                          format: "json",
                          url: "",
                          pricePath: "",
                          datePath: "",
                          dateFormat: "",
                          currencyPath: "",
                          locale: "",
                          headers: "",
                          highPath: "",
                          lowPath: "",
                          volumePath: "",
                          dateTimezone: "",
                        });
                      }}
                    >
                      <Icons.Plus className="mr-1 h-3 w-3" />
                      {t("settings.market_data.custom_provider.enable_historical")}
                    </Button>
                  </div>
                ) : (
                  <div>
                    <div className="mb-3 flex items-center justify-between">
                      <p className="text-muted-foreground text-xs">
                        {t("settings.market_data.custom_provider.historical_source_hint")}
                      </p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground h-6 text-xs"
                        onClick={() => {
                          form.setValue("historicalEnabled", false);
                          form.setValue("historicalSource", undefined);
                        }}
                      >
                        {t("settings.market_data.custom_provider.disable")}
                      </Button>
                    </div>
                    <SourceConfigPanel form={form} prefix="historicalSource" isHistorical />
                  </div>
                )}
              </TabsContent>

              {/* Provider identity — inside scroll area, always visible */}
              <div id="provider-identity" className="mt-4 border-t pt-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_140px_80px]">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          {t("settings.market_data.custom_provider.provider_name")}
                          {!nameManuallyEdited && !isEditing && form.getValues("name") && (
                            <span className="text-muted-foreground ml-1 font-normal">
                              ({t("settings.market_data.custom_provider.from_url")})
                            </span>
                          )}
                        </FormLabel>
                        <FormControl>
                          <Input
                            placeholder={t("settings.market_data.custom_provider.placeholder_provider_name")}
                            {...field}
                            onChange={(e) => handleNameChange(e.target.value, field.onChange)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="code"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          {t("settings.market_data.custom_provider.code")}{" "}
                          <span className="text-muted-foreground font-normal">
                            ({t("settings.market_data.custom_provider.auto")})
                          </span>
                        </FormLabel>
                        <FormControl>
                          <Input
                            placeholder={t("settings.market_data.custom_provider.placeholder_code")}
                            disabled={isEditing}
                            {...field}
                            onChange={(e) => {
                              setCodeManuallyEdited(true);
                              field.onChange(e.target.value);
                            }}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="priority"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("settings.market_data.priority")}</FormLabel>
                        <FormControl>
                          <Input type="number" min={1} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <Collapsible open={descriptionOpen} onOpenChange={setDescriptionOpen}>
                  <CollapsibleTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground mt-2 h-8"
                    >
                      <Icons.FileText className="mr-1 h-3 w-3" />
                      {t("settings.market_data.custom_provider.description")}
                      <Icons.ChevronDown
                        className={`ml-1 h-3 w-3 transition-transform ${descriptionOpen ? "rotate-180" : ""}`}
                      />
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <FormField
                      control={form.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem className="mt-2">
                          <FormControl>
                            <Textarea
                              rows={2}
                              placeholder={t("settings.market_data.custom_provider.placeholder_description")}
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </CollapsibleContent>
                </Collapsible>
              </div>
            </div>
          </Tabs>

          {/* Footer — fixed at bottom */}
          <div className="flex shrink-0 justify-end gap-3 border-t pt-3">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
            >
              {t("settings.shared.cancel")}
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? (
                <span className="flex items-center gap-2">
                  <Icons.Spinner className="h-4 w-4 animate-spin" /> {t("settings.shared.saving")}
                </span>
              ) : isEditing ? (
                t("settings.market_data.custom_provider.save_changes")
              ) : (
                t("settings.market_data.custom_provider.create_provider")
              )}
            </Button>
          </div>
        </form>
      </Form>
    </>
  );
}
