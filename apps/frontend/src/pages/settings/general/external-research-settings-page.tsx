import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@wealthfolio/ui/components/ui/accordion";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@wealthfolio/ui/components/ui/card";
import { Input } from "@wealthfolio/ui/components/ui/input";
import { Label } from "@wealthfolio/ui/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@wealthfolio/ui/components/ui/select";
import { Separator } from "@wealthfolio/ui/components/ui/separator";
import { Switch } from "@wealthfolio/ui/components/ui/switch";
import {
  type ExternalResearchOpenMode,
  type ExternalResearchProvider,
  type ExternalResearchSettings,
  loadExternalResearchSettings,
  saveExternalResearchSettings,
} from "@/lib/external-research-links";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { SettingsHeader } from "../settings-header";

const providerLabelKey = {
  yahoo_us: "settings.research_links.yahoo_us",
  yahoo_de: "settings.research_links.yahoo_de",
  yahoo_ca: "settings.research_links.yahoo_ca",
  onvista: "settings.research_links.onvista",
  financecharts: "settings.research_links.financecharts",
  tmx: "settings.research_links.tmx",
} satisfies Record<ExternalResearchProvider, string>;

function HelpBody({ i18nKey }: { i18nKey: string }) {
  const { t } = useTranslation("common");
  return <p className="text-muted-foreground whitespace-pre-line pr-1 text-sm leading-relaxed">{t(i18nKey)}</p>;
}

function ExternalResearchHelpCard() {
  const { t } = useTranslation("common");

  const sections = [
    { id: "general", triggerKey: "settings.research_links.help.general.trigger", bodyKey: "settings.research_links.help.general.body" },
    { id: "tradingview", triggerKey: "settings.research_links.help.tradingview.trigger", bodyKey: "settings.research_links.help.tradingview.body" },
    { id: "stockanalysis", triggerKey: "settings.research_links.help.stockanalysis.trigger", bodyKey: "settings.research_links.help.stockanalysis.body" },
    { id: "seeking_alpha", triggerKey: "settings.research_links.help.seeking_alpha.trigger", bodyKey: "settings.research_links.help.seeking_alpha.body" },
    { id: "tips", triggerKey: "settings.research_links.help.tips.trigger", bodyKey: "settings.research_links.help.tips.body" },
  ] as const;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t("settings.research_links.help.card_title")}</CardTitle>
        <CardDescription>{t("settings.research_links.help.intro")}</CardDescription>
      </CardHeader>
      <CardContent>
        <Accordion type="multiple" className="w-full">
          {sections.map((s) => (
            <AccordionItem key={s.id} value={s.id}>
              <AccordionTrigger className="text-left text-sm">{t(s.triggerKey)}</AccordionTrigger>
              <AccordionContent>
                <HelpBody i18nKey={s.bodyKey} />
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </CardContent>
    </Card>
  );
}

function ExternalResearchSettingsForm() {
  const { t } = useTranslation("common");
  const [research, setResearch] = useState<ExternalResearchSettings>(() => loadExternalResearchSettings());

  const persistResearch = (next: ExternalResearchSettings) => {
    setResearch(next);
    saveExternalResearchSettings(next);
  };

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="text-lg">{t("settings.research_links.title")}</CardTitle>
          <CardDescription>{t("settings.research_links.description")}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="external-research-open-mode" className="text-sm font-medium">
            {t("settings.research_links.open_mode.title")}
          </Label>
          <p className="text-muted-foreground text-xs">{t("settings.research_links.open_mode.description")}</p>
          <Select
            value={research.openMode}
            onValueChange={(openMode: ExternalResearchOpenMode) => {
              persistResearch({ ...research, openMode });
            }}
          >
            <SelectTrigger id="external-research-open-mode" className="w-full max-w-md">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="app_window">{t("settings.research_links.open_mode.app_window")}</SelectItem>
              <SelectItem value="system_browser">
                {t("settings.research_links.open_mode.system_browser")}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          {research.providers.map((item) => (
            <div key={item.provider} className="flex items-center justify-between rounded-md border p-2">
              <span className="text-sm">{t(providerLabelKey[item.provider])}</span>
              <Switch
                checked={item.enabled}
                onCheckedChange={(checked) => {
                  const providers = research.providers.map((entry) =>
                    entry.provider === item.provider ? { ...entry, enabled: checked } : entry,
                  );
                  persistResearch({ ...research, providers });
                }}
              />
            </div>
          ))}
        </div>

        <div className="space-y-2 border-t pt-4">
          <p className="text-sm font-medium">{t("settings.research_links.custom.title")}</p>
          <p className="text-muted-foreground text-sm leading-relaxed">{t("settings.research_links.custom.description")}</p>
          <div className="space-y-3">
            {research.customs.map((custom, index) => (
              <div key={custom.id} className="space-y-2 rounded-md border p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">
                    {t("settings.research_links.custom.slot", { n: index + 1 })}
                  </span>
                  <Switch
                    checked={custom.enabled}
                    onCheckedChange={(checked) => {
                      const customs = research.customs.map((c) =>
                        c.id === custom.id ? { ...c, enabled: checked } : c,
                      );
                      persistResearch({ ...research, customs });
                    }}
                  />
                </div>
                <Input
                  value={custom.label}
                  onChange={(e) => {
                    const label = e.target.value;
                    const customs = research.customs.map((c) =>
                      c.id === custom.id ? { ...c, label } : c,
                    );
                    persistResearch({ ...research, customs });
                  }}
                  placeholder={t("settings.research_links.custom.label_placeholder")}
                  disabled={!custom.enabled}
                  spellCheck={false}
                  autoComplete="off"
                />
                <Input
                  className="font-mono text-xs"
                  value={custom.urlTemplate}
                  onChange={(e) => {
                    const urlTemplate = e.target.value;
                    const customs = research.customs.map((c) =>
                      c.id === custom.id ? { ...c, urlTemplate } : c,
                    );
                    persistResearch({ ...research, customs });
                  }}
                  placeholder={t("settings.research_links.custom.url_placeholder")}
                  disabled={!custom.enabled}
                  spellCheck={false}
                  autoComplete="off"
                />
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                  <div className="space-y-0.5">
                    <p className="text-sm">{t("settings.research_links.custom.open_in_system_browser")}</p>
                    <p className="text-muted-foreground text-xs">
                      {t("settings.research_links.custom.open_in_system_browser_hint")}
                    </p>
                  </div>
                  <Switch
                    checked={Boolean(custom.openInSystemBrowser)}
                    onCheckedChange={(checked) => {
                      const customs = research.customs.map((c) =>
                        c.id === custom.id ? { ...c, openInSystemBrowser: checked } : c,
                      );
                      persistResearch({ ...research, customs });
                    }}
                    disabled={!custom.enabled}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ExternalResearchSettingsPage() {
  const { t } = useTranslation("common");

  return (
    <div className="space-y-6">
      <SettingsHeader
        heading={t("settings.research_links.heading")}
        text={t("settings.research_links.page_description")}
      />
      <Separator />
      <ExternalResearchSettingsForm />
      <ExternalResearchHelpCard />
    </div>
  );
}
