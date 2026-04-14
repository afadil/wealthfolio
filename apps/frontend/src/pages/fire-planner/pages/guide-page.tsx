import { Card, CardContent, CardHeader, CardTitle } from "@wealthfolio/ui";
import { Trans, useTranslation } from "react-i18next";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className="text-sm leading-relaxed">{children}</CardContent>
    </Card>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="bg-primary text-primary-foreground mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold">
        {n}
      </span>
      <div>
        <p className="font-medium">{title}</p>
        <p className="text-muted-foreground text-xs">{children}</p>
      </div>
    </div>
  );
}

function Term({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="font-medium">{heading}</p>
      <p className="text-muted-foreground text-xs">{children}</p>
    </div>
  );
}

export default function GuidePage({ country }: { country?: string }) {
  const { t } = useTranslation("common");
  const isIT = country === "IT";

  return (
    <div className="space-y-6 pb-8">
      <Section title={t("fire_planner.guide.section_quick_start")}>
        <div className="space-y-4">
          <Step n={1} title={t("fire_planner.guide.step1_title")}>
            {t("fire_planner.guide.step1_body")}
          </Step>
          <Step n={2} title={t("fire_planner.guide.step2_title")}>
            {t("fire_planner.guide.step2_body")}
          </Step>
          <Step n={3} title={t("fire_planner.guide.step3_title")}>
            {t("fire_planner.guide.step3_body")}
          </Step>
          <Step
            n={4}
            title={t(
              isIT ? "fire_planner.guide.step4_title_it" : "fire_planner.guide.step4_title_default",
            )}
          >
            {t("fire_planner.guide.step4_body")}
          </Step>
          <Step n={5} title={t("fire_planner.guide.step5_title")}>
            {t("fire_planner.guide.step5_body")}
          </Step>
        </div>
      </Section>

      <Section title={t("fire_planner.guide.section_dashboard")}>
        <div className="space-y-4">
          <Term heading={t("fire_planner.guide.term_fire_target_net_title")}>
            {t("fire_planner.guide.term_fire_target_net_body")}
          </Term>
          <Term heading={t("fire_planner.guide.term_gross_net_title")}>
            {t("fire_planner.guide.term_gross_net_body")}
          </Term>
          <Term heading={t("fire_planner.guide.term_coast_title")}>
            {t("fire_planner.guide.term_coast_body")}
          </Term>
          <Term heading={t("fire_planner.guide.term_monthly_budget_title")}>
            {t("fire_planner.guide.term_monthly_budget_body")}
          </Term>
          <Term heading={t("fire_planner.guide.term_year_by_year_title")}>
            {t("fire_planner.guide.term_year_by_year_body")}
          </Term>
        </div>
      </Section>

      <Section title={t("fire_planner.guide.section_simulations")}>
        <div className="space-y-4">
          <Term heading={t("fire_planner.guide.term_monte_carlo_title")}>
            {t("fire_planner.guide.term_monte_carlo_body")}
          </Term>
          <Term heading={t("fire_planner.guide.term_strategy_comparison_title")}>
            {t("fire_planner.guide.term_strategy_comparison_body")}
          </Term>
          <Term heading={t("fire_planner.guide.term_scenario_title")}>
            {t("fire_planner.guide.term_scenario_body")}
          </Term>
          <Term heading={t("fire_planner.guide.term_income_projection_title")}>
            {t("fire_planner.guide.term_income_projection_body")}
          </Term>
          <Term heading={t("fire_planner.guide.term_sorr_title")}>
            {t("fire_planner.guide.term_sorr_body")}
          </Term>
          <Term heading={t("fire_planner.guide.term_sensitivity_title")}>
            {t("fire_planner.guide.term_sensitivity_body")}
          </Term>
        </div>
      </Section>

      <Section title={t("fire_planner.guide.section_concepts")}>
        <div className="space-y-4">
          <Term heading={t("fire_planner.guide.term_swr_title")}>
            {t("fire_planner.guide.term_swr_body")}
          </Term>
          <Term heading={t("fire_planner.guide.term_inflation_title")}>
            {t("fire_planner.guide.term_inflation_body")}
            {isIT && t("fire_planner.guide.term_inflation_it_suffix")}
          </Term>
          <Term heading={t("fire_planner.guide.term_return_vol_title")}>
            {t("fire_planner.guide.term_return_vol_body")}
          </Term>
          <Term heading={t("fire_planner.guide.term_horizon_title")}>
            {t("fire_planner.guide.term_horizon_body")}
          </Term>
        </div>
      </Section>

      {isIT && (
        <Section title={t("fire_planner.guide.section_italian")}>
          <div className="space-y-4">
            <Term heading={t("fire_planner.guide.term_it_portfolio_title")}>
              {t("fire_planner.guide.term_it_portfolio_body")}
            </Term>
            <Term heading={t("fire_planner.guide.term_it_fondo_title")}>
              {t("fire_planner.guide.term_it_fondo_body")}
            </Term>
            <Term heading={t("fire_planner.guide.term_it_inps_title")}>
              <Trans
                i18nKey="fire_planner.guide.term_it_inps_body"
                components={{ 0: <strong /> }}
              />
            </Term>
            <Term heading={t("fire_planner.guide.term_it_tfr_title")}>
              {t("fire_planner.guide.term_it_tfr_body")}
            </Term>
          </div>
        </Section>
      )}
    </div>
  );
}
