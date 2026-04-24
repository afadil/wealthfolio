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
          <Step n={1} title="Set the plan basics">
            In Plan inputs, choose the plan type, birth month, retirement age, life expectancy, and
            monthly contribution.
          </Step>
          <Step n={2} title="Enter retirement spending">
            In Retirement Spending, add the monthly spending lines you want the plan to fund. Use
            today's money; inflation is handled by the plan assumptions.
          </Step>
          <Step n={3} title="Add retirement income">
            In Retirement Income, add monthly income streams such as public pensions (e.g. CPP/OAS
            in Canada, Social Security in the US), workplace pensions, part-time work, or annuity
            income. Use Add pension fund only when the planner should estimate a payout from a fund
            balance at 3.5%/yr unless you enter a monthly payout yourself.
          </Step>
          <Step n={4} title="Check assumptions, taxes, and account shares">
            Review projected returns, fees, volatility, inflation, withdrawal tax rates, tax
            buckets, and which accounts fund the goal.
          </Step>
          <Step n={5} title="Read Overview, then open What If">
            Overview answers whether the base plan works and shows the trajectory, spending
            coverage, and plan inputs. What If tests the same plan across market paths, stress
            tests, decision maps, and advanced checks.
          </Step>
        </div>
      </Section>

      <Section title="Understanding Overview">
        <div className="space-y-4">
          <Term t="Base plan answer">
            The hero summarizes the deterministic plan: whether spending is funded, whether the
            portfolio runs out before the planning horizon, and how the projected balance compares
            with the required capital at your target age.
          </Term>
          <Term t="Required capital">
            The estimated portfolio needed at your target age to fund the spending schedule you
            entered, after counting retirement income that starts later and estimated withdrawal
            taxes. It is a planning target, not a yearly spending rule.
          </Term>
          <Term t="Portfolio trajectory">
            The solid line shows what you are projected to have. The dashed line shows what the plan
            is estimated to need over time. Use Today's value to read everything in today's money,
            or Nominal to include future inflation.
          </Term>
          <Term t="Retirement spending coverage">
            Your planned monthly retirement spending broken down by funding source. Income streams
            active at the selected retirement age appear as coloured segments; the remainder is what
            the portfolio must cover. Deferred streams show how the mix shifts at the age they
            start.
          </Term>
          <Term t="Plan input cards">
            The cards on the right are the editable inputs: Plan inputs, Retirement Spending,
            Retirement Income, Projection Assumptions, Withdrawal Taxes, and Account Shares.
          </Term>
          <Term t="Year-by-Year Snapshot">
            The table shows the projected end portfolio, yearly contribution, retirement income,
            planned spending, and portfolio withdrawal by age.
          </Term>
        </div>
      </Section>

      <Section title="Understanding What If">
        <div className="space-y-4">
          <Term t="Market paths">
            Tests the same plan across many possible market paths using your return, volatility, and
            inflation assumptions. The shaded range shows bad-to-good outcomes; the line shows the
            middle path. Money lasts means the plan covers essential spending and still has money
            left through the planning horizon. In FIRE mode, the plan also needs to reach financial
            independence first.
          </Term>
          <Term t="Base case">
            Shows the same deterministic base plan as Overview, then points to the largest stress
            result so you can see what matters most.
          </Term>
          <Term t="Stress tests">
            Fixed checks show how the plan changes if returns are lower, inflation is higher,
            spending rises, retirement starts earlier, savings fall, or a market crash happens near
            retirement.
          </Term>
          <Term t="What moves the plan?">
            Decision maps compare savings, returns, retirement age, and spending. Green cells leave
            more money at the end. Red cells still leave a gap or run short.
          </Term>
          <Term t="Early market crash paths">
            Compares a few crash-timing paths near retirement. A crash in the first retirement year
            can hurt more than the same crash later because withdrawals happen while the portfolio
            is down.
          </Term>
        </div>
      </Section>

      <Section title="Key concepts">
        <div className="space-y-4">
          <Term t="How yearly spending is modeled">
            Your expenses drive the withdrawal. Each year the planner funds the spending plan you
            entered, subtracts retirement income, and estimates any tax drag on portfolio
            withdrawals.
          </Term>
          <Term t="How the target is calculated">
            The planner computes the present value of your full spending schedule from retirement
            through your planning horizon — accounting for each expense bucket's inflation rate,
            income streams that start at different ages, and tax drag on withdrawals. When your
            portfolio reaches this amount, the base plan has enough capital for the schedule you
            entered. This is more accurate than a simple multiple of expenses because it handles
            varying expenses, deferred pensions, and finite horizons.
          </Term>
          <Term t="Inflation rate">
            All projections grow expenses and inflation-linked income at this rate year over year.
            The default 2% matches the ECB target.
            {isIT && " Use 2.5–3% for a more conservative Italian CPI assumption."}
          </Term>
          <Term t="Returns, fees, and volatility">
            Return before retirement drives accumulation. Return during retirement drives the
            withdrawal phase and required capital. Annual investment fees are subtracted from both.
            Volatility is used only in market-path checks — higher values produce a wider fan of
            outcomes.
          </Term>
          <Term t="Planning horizon age">
            How long the portfolio must last. The retirement target and What If checks run to this
            age. Set it to 90–95 to stress-test longevity. Early market crash paths and Money lasts
            are both measured at this horizon.
          </Term>
        </div>
      </Section>

      {isIT && (
        <Section title="Italian retirement setup (fondo pensione, TFR, INPS)">
          <div className="space-y-4">
            <Term t="Investment portfolio (Golden Butterfly, All-Weather…)">
              This is your main portfolio — the value Wealthfolio tracks. Set your return
              assumptions, fee drag, and monthly contribution here. It is the primary accumulation
              engine of your retirement plan.
            </Term>
            <Term t="Fondo pensione integrativo (supplementary pension fund)">
              Use Add pension fund. Enter the current fund balance, monthly contribution, expected
              fund return, and payout start age. The planner estimates the future balance and, if
              you do not enter a monthly payout, estimates payout as 3.5%/yr of that projected
              balance from the start age.
            </Term>
            <Term t="Pensione INPS (state pension — previdenza obbligatoria)">
              Use Add retirement income. Enter your estimated monthly net pension in{" "}
              <strong>today's money</strong> and set the payout start age. Use Indexed if you want
              the income to rise with the plan inflation assumption.
            </Term>
            <Term t="TFR (Trattamento di Fine Rapporto — severance accrual)">
              If your TFR goes into a pension fund, include it in the monthly fund contribution. If
              you keep it separate, model it as another pension fund with its own balance,
              contribution, return, and payout start age. The same 3.5%/yr payout estimate applies
              unless you enter a monthly payout yourself.
            </Term>
          </div>
        </Section>
      )}
    </div>
  );
}
