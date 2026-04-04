import { Card, CardContent, CardHeader, CardTitle } from "@wealthfolio/ui";

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

function Term({ t, children }: { t: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="font-medium">{t}</p>
      <p className="text-muted-foreground text-xs">{children}</p>
    </div>
  );
}

export default function GuidePage({ country }: { country?: string }) {
  const isIT = country === "IT";

  return (
    <div className="space-y-6 pb-8">
      <Section title="Quick start — 5 steps">
        <div className="space-y-4">
          <Step n={1} title="Configure FIRE settings (Settings → FIRE Planner)">
            Enter your current age, target FIRE age, and monthly spend in retirement. Use today's
            money — inflation is handled automatically. Saving will also create a "FIRE" goal in
            your portfolio, visible on the main Dashboard.
          </Step>
          <Step n={2} title="Set your monthly contribution and expected return">
            Enter how much you invest each month and your expected annual portfolio return (7% is a
            common long-term figure for a diversified equity portfolio). If you enter your annual
            salary the planner shows your savings rate and can grow contributions with raises.
          </Step>
          <Step n={3} title="Add income streams (pension, part-time, annuity…)">
            Each stream has a monthly amount (in today's money) and a payout start age. Streams
            active from your FIRE age reduce how much the portfolio must cover. Deferred streams
            (e.g. state pension at 67) are modelled as separate phases that kick in later.
          </Step>
          <Step
            n={4}
            title={
              isIT
                ? "Pension accumulation funds (fondo pensione, TFR)"
                : "Pension accumulation funds (provident funds, employer schemes)"
            }
          >
            Enable "Has accumulation fund" on the stream. Enter the current fund balance, monthly
            contribution, and the fund's expected annual return. Link it to the matching Wealthfolio
            account to pull the live balance with one click. The planner accumulates the fund until
            FIRE, then lets it grow contribution-free until payout age.
          </Step>
          <Step n={5} title="Read the Dashboard, then explore Simulations">
            The Dashboard shows your FIRE target, progress, budget breakdown by source, and a
            year-by-year table. Simulations runs Monte Carlo (100,000 paths), scenario analysis,
            sensitivity heatmaps, and sequence-of-returns crash tests.
          </Step>
        </div>
      </Section>

      <Section title="Understanding the Dashboard">
        <div className="space-y-4">
          <Term t="FIRE Target (net)">
            The portfolio you need to accumulate, after subtracting income available from day one of
            FIRE. A €1,200/mo stream that starts at your FIRE age reduces your target by €1,200 × 12
            / withdrawal rate. Deferred streams (e.g. state pension at 67) do NOT reduce this number
            — your portfolio must bridge the gap on its own until those streams start.
          </Term>
          <Term t="Gross vs net target">
            The gross target (annual expenses / withdrawal rate) ignores income streams. The net
            target subtracts day-one income, giving the actual amount your portfolio needs to
            accumulate. The Dashboard shows the net target as the primary figure. The FIRE goal
            synced to your portfolio uses the gross target — the number you "see" as your savings
            milestone.
          </Term>
          <Term t="Coast FIRE amount">
            If you stopped contributing today, this is the minimum portfolio needed to grow to your
            FIRE target by your target age on investment returns alone. Once you pass Coast FIRE,
            every additional contribution accelerates retirement rather than enabling it.
          </Term>
          <Term t="Monthly Budget at FIRE">
            Your total monthly spend broken down by funding source. Income streams active from FIRE
            age appear as coloured segments; the remainder is what the portfolio must cover. Each
            deferred stream shows how the mix shifts at the age it starts.
          </Term>
          <Term t="Year-by-Year table">
            The accumulation phase shows annual contributions and portfolio growth. The FIRE phase
            shows annual expenses, income from each stream, and the net withdrawal from the
            portfolio. The highlighted row marks when FIRE is reached; blue rows mark when a new
            income stream activates.
          </Term>
        </div>
      </Section>

      <Section title="Understanding Simulations">
        <div className="space-y-4">
          <Term t="Monte Carlo (100,000 simulations)">
            Runs your plan 100,000 times using a two-regime fat-tailed return distribution: 85% of
            years draw from a normal distribution centred on your expected return, 15% are stress
            years with heavier downside. Inflation is stochastic per year. The fan chart shows
            percentile bands P10–P90. Success rate = % of simulations where the portfolio survives
            to your planning horizon. Aim for ≥ 90%.
          </Term>
          <Term t="Strategy Comparison">
            Compares constant-dollar withdrawal (fixed real amount each year) against
            constant-percentage withdrawal (fixed % of remaining portfolio). Constant-%
            mathematically never depletes the portfolio but annual spending fluctuates with markets.
            Run "Compare Strategies" to see which fits your risk tolerance.
          </Term>
          <Term t="Scenario Analysis">
            Three return assumptions: pessimistic (−2%), base case, and optimistic (+1.5%). Shows
            how sensitive your FIRE date is to return differences. Income streams are fully
            reflected — the lines diverge in the FIRE phase where withdrawals differ.
          </Term>
          <Term t="Income Streams Projection">
            Stacked area chart of each income stream over time versus your inflation-adjusted
            expense line. The gap between the stack and the line is the portfolio withdrawal needed
            each year. The coverage table shows what fraction of expenses are self-funded at each
            key age.
          </Term>
          <Term t="Sequence of Returns Risk (SORR)">
            Five crash scenarios starting from your FIRE date. A crash in year 1 is far more
            dangerous than the same crash in year 10 because early withdrawals lock in losses.
            Substantial income streams reduce SORR significantly — a green banner appears when
            streams cover more than 30% of expenses.
          </Term>
          <Term t="Sensitivity Analysis">
            Two heatmaps: FIRE age across contribution levels × return rates, and FIRE age across
            withdrawal rate × return rates. Your current settings are highlighted in blue. Use this
            to identify which lever — saving more, earning more, or spending less — matters most.
          </Term>
        </div>
      </Section>

      <Section title="Key concepts">
        <div className="space-y-4">
          <Term t="Annual withdrawal rate">
            The percentage of your portfolio you withdraw each year in retirement. The classic 4%
            rule (Trinity Study) means a €1M portfolio supports €40k/year. This planner defaults to
            3.5% — more conservative and appropriate for early retirees with longer horizons. A
            lower rate means a larger required portfolio but more safety margin.
          </Term>
          <Term t="How the withdrawal rate is used">
            Its role depends on which withdrawal strategy you choose:
            <ul className="text-muted-foreground mt-2 list-disc space-y-1.5 pl-4 text-xs">
              <li>
                <strong>Constant Dollar</strong> — Your expenses drive the withdrawal, not the rate.
                Each year you withdraw exactly what you need (expenses minus income, grossed up for
                taxes). The rate is only used to convert defined-contribution pension fund balances
                into monthly income.
              </li>
              <li>
                <strong>Constant %</strong> — You withdraw the rate × your portfolio each year,
                regardless of expenses. Income varies with market performance.
              </li>
              <li>
                <strong>Guardrails</strong> — Targets your expenses like Constant Dollar, but clips
                withdrawals to ceiling (1.5× the rate) or floor (0.8× the rate) bands relative to
                the portfolio. Protects against overspending in down markets while allowing raises
                in up markets.
              </li>
            </ul>
          </Term>
          <Term t="How you reach financial independence">
            The planner computes the present value of your full spending schedule from retirement
            through your planning horizon — accounting for each expense bucket's inflation rate,
            income streams that start at different ages, and tax drag on withdrawals. When your
            portfolio reaches this amount, you're financially independent. This is more accurate
            than the classic "25× expenses" rule because it handles varying expenses, deferred
            pensions, and finite horizons.
          </Term>
          <Term t="Inflation rate">
            All projections grow expenses and inflation-linked income at this rate year over year.
            The default 2% matches the ECB target.
            {isIT && " Use 2.5–3% for a more conservative Italian CPI assumption."}
          </Term>
          <Term t="Expected return and volatility">
            Expected return is the average annual growth of your portfolio. For a diversified global
            equity portfolio, 6–8% (nominal) is a common long-term assumption. Volatility (std dev)
            is used only in Monte Carlo — higher values produce a wider fan of outcomes. 12% is
            typical for a mixed equity/bond portfolio.
          </Term>
          <Term t="Planning horizon age">
            How long the portfolio must last. The FIRE target and all simulations run to this age.
            Set it to 90–95 to stress-test longevity. The Sequence of Returns and Monte Carlo
            success rate are both measured at this horizon.
          </Term>
        </div>
      </Section>

      {isIT && (
        <Section title="Italian FIRE setup (fondo pensione, TFR, INPS)">
          <div className="space-y-4">
            <Term t="Investment portfolio (Golden Butterfly, All-Weather…)">
              This is your main portfolio — the value Wealthfolio tracks. Set your expected return
              and monthly contribution here. It is the primary accumulation engine of your FIRE
              plan.
            </Term>
            <Term t="Fondo pensione integrativo (supplementary pension fund)">
              Add it as an income stream and enable "Has accumulation fund". Enter the current fund
              balance (or link the Wealthfolio account and click Sync), the monthly TFR
              contribution, and the fund's net annual return (check your fund's factsheet — 3–5%
              after fees is common). Set the payout start age to when you plan to draw it (typically
              65–67). The planner accumulates contributions until FIRE, then lets the fund grow
              without new contributions until payout age. The linked account is automatically
              included in your FIRE goal allocations.
            </Term>
            <Term t="Pensione INPS (state pension — previdenza obbligatoria)">
              Add it as a plain income stream (no accumulation fund). Enter your estimated monthly
              net pension in <strong>today's euros</strong> (real value) and set the payout start
              age (typically 67 for the contributivo system). Enable "Inflation-adjusted" since INPS
              is indexed to the cost of living. Use the INPS simulator (inps.it) to estimate your
              amount — the simulator gives a future nominal value, so convert it to today's euros by
              dividing by (1 + inflation)^years. Example: simulator says €1,500 at age 67 in 35
              years at 2% inflation → enter €1,500 / 1.02³⁵ ≈ €750.
            </Term>
            <Term t="TFR (Trattamento di Fine Rapporto — severance accrual)">
              TFR is typically paid into the fondo pensione — model it as the monthly contribution
              on that stream. Rough estimate: gross monthly salary × 6.91%. If you keep TFR in
              azienda instead, it grows at 1.5% + 75% of the ISTAT index — use a lower
              accumulationReturn (≈ 2–3%) with no monthly contribution.
            </Term>
          </div>
        </Section>
      )}
    </div>
  );
}
