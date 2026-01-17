Sure — here’s a comprehensive spec in a format you can put straight into a
design doc. Casual tone, but structured and thorough. Treating you as an expert,
so I’ll lean on concepts without over-explaining.

---

# **Feature Spec — Health & Diagnostics System**

## **Context**

The app is a local portfolio tracker (Tauri: Rust backend + React frontend). It
maintains financial data with dependencies on:

- Market data (prices, FX)
- Import/sync pipelines
- DB schema & migrations
- Classification & metadata
- User config

Users expect numbers to be **correct**, **fresh**, and **explainable**, and they
need to know when something is degraded or broken.

Today, issues are silent → misvaluations, stale prices, misclassification,
missing FX paths, invalid schema states, partial migrations, orphan data, etc.
This reduces trust and creates support burden.

---

## **Vision**

Introduce a persistent “Health Center” that:

- Continuously inspects and grades portfolio/infra data
- Surfaces issues in a visible, non-intrusive way
- Offers resolution paths (fix actions & navigation)
- Builds trust that “numbers are correct”
- Enables power users to audit their data at will

Analogy: compiler diagnostics + linter + pipeline monitor + SRE health
dashboard, but for portfolio data.

---

## **Goals**

### **Primary Goals**

- Detect structural inconsistencies
- Detect stale data (prices, FX, sync)
- Detect missing metadata (classification, country, etc.)
- Detect broken migrations / schema mismatches
- Surface human-actionable remediation
- Enable auto-fix where safe
- Give global status (green/yellow/red)
- Support drill-down and filter

### **Secondary Goals**

- Enable quantification (impact % MV)
- Enable snoozing/ignoring issues
- Configurable thresholds
- Non-blocking execution (background or async)
- Minimal startup overhead; scalable with portfolio size

### **Non-goals (for now)**

- Cloud push health reporting
- Multi-user coordination
- Machine learning diagnostics
- External alerting/notifications

---

## **Core Design Concepts**

### **1. Check System**

Each **Check** is a pure diagnostic rule:

- Input: DB + config + current time
- Output: zero to many **Issues**
- Read-only (no side effects)
- Independent & parallelizable

`HealthCheck` trait in Rust:

```rust
fn id(&self) -> &'static str;
fn category(&self) -> HealthCategory;
fn run(&self, ctx: &HealthContext) -> Result<Vec<HealthIssue>>;
```

### **2. Issue Model**

Issue = structured diagnostic emitted by a Check.

Fields:

- `id` (stable)
- `severity` (Info | Warning | Error | Critical)
- `category` (Consistency | DataStaleness | Migration | Classification | …)
- `title` + `message`
- `affected_items` (count)
- `affected_mv_pct: Option<f64>`
- `auto_fixable: bool`
- `fix_action: Option<FixAction>`
- `navigate_to: Option<Route>`
- `details: Option<String>` (raw, for drawer)
- `timestamp`

Notes:

- Evaluated severity can depend on **impact** (% MV).
- Always actionable: either `fix_action` or `navigate_to`.

### **3. Severity Semantics**

| Level        | Meaning                      | Action       |
| ------------ | ---------------------------- | ------------ |
| **Info**     | Cosmetic                     | Ignore OK    |
| **Warning**  | Degraded analytics / UX      | Should fix   |
| **Error**    | Incorrect numbers for subset | Must fix     |
| **Critical** | Valuation untrustworthy      | Must fix now |

Global status resolution:

```
if any Critical → Critical
else if any Error → Error
else if any Warning → Warning
else OK
```

UI can collapse (Warning vs Critical) if needed.

---

## **Categorization of Checks**

### **A. Schema & Migrations**

- Schema version mismatch
- Partial migrations
- Invalid enum values
- Deprecated fields not migrated

Severity: `Error` or `Critical`

Auto-fix: run migrations

### **B. Data Consistency**

- Referential integrity (orphan accounts/transactions/instruments)
- Balance invariants (account-level)
- Position invariants (holdings)
- Duplicate overlapping transactions
- Invalid timestamps (future, pre-account-open)
- Currency mismatch errors
- Unknown instruments

Severity: `Warning → Critical` depending coverage

### **C. FX Integrity**

Three sub-categories:

1. **FX Graph Connectivity**
   - Missing FX pair to base currency → may block valuation
   - Severity: percentage-of-MV driven

2. **FX Quote Staleness**
   - Threshold windows: 24h warning / 72h critical (configurable)
   - Severity: MV-based

3. **FX Time-Series Coverage**
   - % of open market days covered in trailing window (e.g. 90 days)
   - Severity: data-quality-centric (Warning mostly)

Actions:

- Navigate to FX settings
- Trigger FX fetch/backfill

### **D. Prices / Market Data**

- Stale prices (instrument-level)
- Missing prices (holes)
- Instruments without a price source
- Unsupported exchanges

Severity: MV-driven

### **E. Classification Completeness**

Dimensions (configurable):

- Asset class (required)
- Sector (important)
- Country (important)
- Region (optional)
- Strategy (optional)

Policy parameters:

- `warn_mv_pct`
- `critical_mv_pct`
- Required vs optional dims

Emit aggregated issue per dimension:

Example:

> “Asset class missing for 18.4% of MV (23 instruments)”

Action: navigate to classification page with filter

### **F. Integrations & Sync**

- Stale account sync
- Broken API keys
- Repeated task failures
- Disabled integrations still referenced

Actions: navigate to integration settings or “Sync now”

### **G. Backup / Storage**

- Last backup too old
- DB file too large
- Too many log files

Mostly `Info` / `Warning`

### **H. Versioning / Security**

- Outdated app version
- Unencrypted sensitive fields (if policy enabled)

---

## **Impact Computation**

Compute % MV affected to avoid naive severity.

Formula:

```
pct = missing_mv / total_mv
```

Severity mapping example:

```
pct >= 0.30 → Critical
pct >= 0.05 → Warning
```

These thresholds become configuration knobs.

---

## **User Interface Design**

### **Top-Level Badge**

- Persistent top-right icon (shield / triangle)
- Color + count bubble
- On click → `/health`

### **Health Dashboard**

Sections:

1. Summary
   - X critical / Y errors / Z warnings
   - “Run checks”
   - Optional “Auto-fix safe issues”

2. Filters
   - by severity
   - by category
   - search

3. Issues list (aggregated)
   - title + severity + MV% + CTA

4. Issue details (drawer)
   - raw details
   - affected instruments/accounts
   - actions (fix or navigate)

5. Snoozing
   - ignore issue id
   - toggle “show ignored”

### **Navigation Contracts**

Every issue must map to either:

- Auto-fix (backend)
- Navigate (React route)
- Or explicit “manual resolution instructions”

No dead ends.

---

## **Execution Strategy**

Modes:

- On startup (fast checks)
- On demand (from UI)
- Background refresh (interval)
- Async / debounced after sync/import

Performance considerations:

- Parallel execution per check
- Mark checks cheap vs expensive
- Cache results w/ timestamp
- Expire stale results in UI

---

## **Configuration**

User/system config:

- classification policy
- MV thresholds (warn/critical)
- FX stale windows
- price stale windows
- backup freshness
- sync freshness
- snoozed issue_ids

System config (immutable at build-time):

- schema version targets
- required dimensions
- reserved enum values

---

## **Test Strategy**

- Unit tests per check with synthetic fixtures
- Property tests for balances/positions
- Integration tests with corrupted snapshot DB
- Golden snapshot of issue lists to preserve semantics
- Regression tests for partial migration failures

---

## **Future Extensions (Speculative)**

(flagging speculations as requested)

- ML auto-classification suggestions (speculative)
- Cross-portfolio consistency (multi-account)
- Alerting through desktop notifications
- Historical health timeline
- User-defined custom checks via DSL (long-term, speculative)
- Plugin system for institutions (speculative)

---

## **Success Criteria**

Quantitative:

- <1% silent data corruption
- > 90% issues resolved w/ fix or navigate
- <500ms cheap check startup latency
- No blocking UI during execution

Qualitative:

- Users trust valuations
- Users discover import/config issues early
- Support requests decrease for “numbers look wrong”

---

If you want, I can convert this into:

- an engineering ticket set
- a sequence diagram
- DB schema updates
- or a P0/P1 scope for v1 vs v2 deliverables.
