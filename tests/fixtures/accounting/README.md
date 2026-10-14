# Accounting contract fixtures

These fixtures are the shared accounting contract for activity semantics.

- `activity_semantics.json` defines the expected cash, net-contribution,
  performance, spending, and income effect of one activity.
- `ledger_scenarios.json` defines whole-ledger reconciliations. These catch
  individually plausible classifications that produce an impossible result when
  combined.

The portfolio engine (`crates/portfolio-engine/tests/accounting_contract.rs`)
and the spending classifier consume the same cases. Import and form tests verify
that the boundary metadata required by those cases survives activity creation.

## Required invariants

- `gain = ending cash + investment value - net contribution` for the simple cash
  scenarios represented here.
- A fully reversed external purchase has zero net spending and zero gain.
- An explicit `metadata.flow.is_external` value overrides a credit subtype's
  default performance boundary.
- Brokerage refunds without an explicit external boundary remain internal.
- Cash-account expense reversals created by supported entry paths carry an
  explicit external boundary.

When adding or changing an accounting activity, update the atomic contract, add
a ledger scenario when the activity reverses or pairs with another entry, and
cover its import or form path. Randomized tests should enforce invariants; they
should not duplicate the production formula as their oracle.
