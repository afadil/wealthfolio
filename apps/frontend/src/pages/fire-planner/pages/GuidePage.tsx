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
  return (
    <div className="space-y-6 pb-8">
      <Section title="Quick start — 5 steps">
        <div className="space-y-4">
          <Step n={1} title="Set your FIRE Parameters (Settings tab)">
            Enter your current age, your target FIRE age, and how much you plan to spend per month
            once retired. Use today's money — inflation is handled automatically.
          </Step>
          <Step n={2} title="Set your monthly contribution and expected return">
            Enter how much you invest each month and your expected annual portfolio return (7% is a
            common historical figure for a diversified equity portfolio). If you enter your annual
            salary, the planner will show your savings rate and can grow contributions with your
            raises.
          </Step>
          <Step n={3} title="Add income streams (pension, part-time, annuity…)">
            Each stream has a monthly amount and a payout start age. Streams active at your FIRE age
            reduce how much your portfolio needs to cover. Streams that start later (e.g. state
            pension at 67) are modelled as deferred phases.
          </Step>
          <Step n={4} title="For pension funds with accumulation (fondo pensione, TFR)">
            Enable the "Has accumulation fund" toggle on the stream. Enter the current fund balance,
            monthly contribution (TFR), and the fund's annual return. Link it to the matching
            Wealthfolio account to pull the live balance with one click.
          </Step>
          <Step n={5} title="Read the Dashboard, then explore Simulations">
            The Dashboard shows your FIRE target, progress, budget breakdown by source, and a
            year-by-year table. Simulations runs Monte Carlo (1,000 paths), scenarios, and
            crash-stress tests.
          </Step>
        </div>
      </Section>

      <Section title="Understanding the Dashboard">
        <div className="space-y-4">
          <Term t="FIRE Target (net)">
            The portfolio you need to accumulate, after subtracting income available from day one of
            FIRE. A €1,200/mo pension that starts at your FIRE age reduces your target by €1,200 ×
            12 / SWR. Deferred streams (e.g. state pension at 67) do NOT reduce this number — your
            portfolio must bridge that gap on its own.
          </Term>
          <Term t="Coast FIRE amount">
            If you stopped contributing today, this is the minimum portfolio needed to grow to your
            FIRE target by your target age, purely on investment returns. Once you pass this number,
            every additional contribution is accelerating retirement, not enabling it.
          </Term>
          <Term t="Monthly Budget at FIRE">
            Your total monthly spend broken down by funding source. Income streams active from FIRE
            age appear as coloured segments; the grey segment is what the portfolio must cover. Each
            deferred stream then shows how the mix shifts at the age it starts.
          </Term>
          <Term t="Year-by-Year table">
            The accumulation phase shows annual contributions and portfolio growth. The FIRE phase
            shows annual expenses, income from each stream, and the net withdrawal from the
            portfolio. The highlighted row is when FIRE is reached; blue rows mark when a new income
            stream kicks in.
          </Term>
        </div>
      </Section>

      <Section title="Understanding Simulations">
        <div className="space-y-4">
          <Term t="Monte Carlo (1,000 simulations)">
            Runs your plan 1,000 times using a two-regime fat-tailed return distribution (85% of
            years draw from a shifted-up normal, 15% are stress years with heavier downside), with
            stochastic per-year inflation. The fan chart shows percentile bands P10–P90. Success
            rate = % of simulations where the portfolio survives to your planning horizon age. Aim
            for ≥ 90%.
          </Term>
          <Term t="Scenario Analysis">
            The same plan run with three different return assumptions: pessimistic (−2%), base case,
            and optimistic (+1.5%). Shows how sensitive your FIRE date is to return assumptions.
            Income streams are fully reflected — the lines diverge in the FIRE phase where
            withdrawals differ.
          </Term>
          <Term t="Income Streams Projection">
            Shows each income stream as a stacked area growing over time, versus your
            inflation-adjusted expense line. The gap between the areas and the line is the portfolio
            withdrawal needed each year. Coverage % in the table tells you how much of expenses are
            self-funded at each key age.
          </Term>
          <Term t="Sequence of Returns Risk (SORR)">
            Tests five crash scenarios starting from your FIRE date. A crash in year 1 is far more
            dangerous than the same crash in year 10 because early withdrawals lock in losses.
            Substantial income streams reduce SORR significantly — the green banner appears if your
            streams cover more than 30% of expenses.
          </Term>
          <Term t="Sensitivity Analysis">
            Two heatmaps: FIRE age across contribution levels × return rates, and FIRE target across
            SWR × return rates. Your current settings are highlighted in blue. Use this to
            understand what levers matter most for your timeline.
          </Term>
        </div>
      </Section>

      {country === "IT" && (
        <Section title="Italian FIRE setup (fondo pensione, TFR, INPS)">
          <div className="space-y-4">
            <Term t="Portafoglio investito (Golden Butterfly, All-Weather…)">
              This is your main portfolio — the value Wealthfolio tracks. Set your expected return
              and monthly contribution here. This is the primary engine of your FIRE plan.
            </Term>
            <Term t="Fondo pensione integrativo">
              Add it as an income stream. Enable "Has accumulation fund". Set the current fund
              balance (or link the Wealthfolio account and click Sync), the monthly TFR
              contribution, and the fund's net return (check your fund's factsheet — 3–5% is common
              after fees). Set the payout start age to when you plan to draw it (typically pension
              age, 65–67). The planner will accumulate TFR until you FIRE, then let the fund grow
              without new contributions until payout age.
            </Term>
            <Term t="Pensione INPS (previdenza obbligatoria)">
              Add it as a pure income stream (no accumulation toggle). Enter your estimated monthly
              net pension in <strong>today's euros</strong> (real value) and set the payout start
              age (typically 67 for contributivo). Enable "Inflation-adjusted" since INPS is linked
              to cost-of-living indexation. Use the INPS simulator (inps.it) to estimate your amount
              — the simulator gives a future nominal value, so divide it by (1 + inflation)^years to
              convert to today's euros. Example: simulator says €1,500 at age 67 in 35 years at 2%
              inflation → enter €1,500 / 1.02^35 ≈ €750.
            </Term>
            <Term t="TFR (Trattamento di Fine Rapporto)">
              TFR is typically paid into your fondo pensione — model it as the monthly contribution
              on that stream. Rough estimate: gross monthly salary × 6.91% / 12. If you keep TFR in
              azienda instead, it grows at 1.5% + 75% of ISTAT inflation — use a lower
              accumulationReturn (≈ 2–3%) and no monthly contribution.
            </Term>
          </div>
        </Section>
      )}

      <Section title="Key concepts">
        <div className="space-y-4">
          <Term t="Safe Withdrawal Rate (SWR)">
            The % of your portfolio you withdraw annually in retirement. The classic 4% rule (from
            the Trinity Study) means a €1M portfolio supports €40k/year. This planner defaults to
            3.5% — more conservative and appropriate for early retirees with longer horizons. Lower
            SWR = larger required portfolio = more safety.
          </Term>
          <Term t="Inflation rate">
            All projections grow expenses and inflation-linked income at this rate year over year.
            The default 2% matches the ECB target. Use 2.5–3% if you want a more conservative
            assumption for Italian CPI.
          </Term>
          <Term t="Expected return and volatility">
            Expected return is the average annual growth of your portfolio. For a diversified global
            equity portfolio, 6–8% real (after inflation) is a common long-term assumption.
            Volatility (std dev) is used only in Monte Carlo — higher values produce a wider fan of
            outcomes. 12% is typical for a mixed equity/bond portfolio.
          </Term>
          <Term t="Net FIRE target vs gross">
            The gross target (spese × 12 / SWR) ignores income streams. The net target subtracts
            income available from day-one of FIRE, giving the actual amount your portfolio needs to
            cover. The Dashboard card shows the net target as the main figure.
          </Term>
        </div>
      </Section>
    </div>
  );
}
