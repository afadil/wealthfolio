# Testing Strategy

Lessons and patterns from implementing Wealthfolio's multi-layer test suite.
Inspired by: Rust std, s2n-tls (AWS), Firecracker VMM, axum, tokio, Hypothesis,
PropEr.

---

## Layers

| Layer               | Tool                                     | Scope             | When to run                          |
| ------------------- | ---------------------------------------- | ----------------- | ------------------------------------ |
| Unit                | `#[test]` / Vitest                       | Single function   | Every commit (PR check)              |
| Integration         | `#[test]` (in-process DB)                | Service + DB      | Every commit                         |
| Snapshot regression | `insta`                                  | Serialised output | Every commit + nightly               |
| Property / fuzzing  | `proptest` + `fast-check`                | Domain invariants | PR check (100 cases) + nightly (10k) |
| Migration integrity | `diesel_migrations`                      | DB schema         | Nightly                              |
| Formal verification | Kani model checker                       | Arithmetic safety | Nightly                              |
| E2E                 | Playwright                               | Full user flow    | Nightly                              |
| Coverage            | `cargo-llvm-cov` + `@vitest/coverage-v8` | Line/branch       | Nightly → Codecov                    |

---

## Lessons

### 1. Snapshot tests are the cheapest regression net

Use `insta` (`assert_json_snapshot!`, `assert_snapshot!`) for any serialised
output that crosses a service boundary. The first run creates the snapshot file;
subsequent runs compare. Reviewing a diff is far cheaper than debugging a silent
regression.

Run `cargo insta review` after any intentional model change to accept new
snapshots.

**Key pattern**: always redact unstable fields (`".createdAt" => "[datetime]"`)
so snapshots don't flap on CI.

### 2. Property tests find the edge cases humans miss

A single `proptest!` block with `any::<T>()` generators exercises thousands of
inputs. Financial software is especially susceptible to edge cases: zero
quantities, large prices, negative fees, empty strings.

**Rule**: every pure function that accepts financial input should have at least
one property test proving it is total (doesn't panic) for its declared domain.

**Scaling**: run 100 cases in PR check (fast), 10 000 cases nightly (thorough).
Set via `PROPTEST_CASES` env var.

### 3. Formal verification (Kani) proves absence of panics

Kani is a bounded model checker — it exhaustively checks all paths for a bounded
input domain. Use it for critical arithmetic (cost = qty × price, gain
percentage) where overflow or division-by-zero would be a silent financial bug.

**Setup**: add `#[cfg(kani)]` module to `crates/core/tests/kani_proofs.rs`. CI
uses `model-checking/kani-github-action@v1`.

**Key insight**: unlike fuzzing, Kani _proves_ the absence of a bug for the
bounded domain — it's not sampling.

### 4. Migration round-trip tests prevent destructive rollbacks

Every migration must have a valid `down.sql`. Test this with:

```rust
conn.run_pending_migrations(MIGRATIONS)?;
conn.revert_all_migrations(MIGRATIONS)?;
conn.run_pending_migrations(MIGRATIONS)?;
```

Use `embed_migrations!()` from `diesel_migrations` so the test is self-contained
(no external files needed at runtime).

Use `tempfile::NamedTempFile` for an isolated per-test SQLite DB — never share
state between migration tests.

### 5. E2E tests need a stable server + DB

The existing `scripts/prep-e2e.mjs` + `scripts/run-e2e.mjs` pattern:

1. `prep-e2e.mjs` creates a timestamped `wealthfolio-test-*.db` with seed data
2. `run-e2e.mjs` starts the Axum server pointing at that DB, then runs
   Playwright

For CI headless mode: `headless: !!process.env.CI` in `playwright.config.ts`.
Never hardcode `headless: false` — it breaks CI silently.

Use `channel: "chrome"` only for local dev; CI installs Chromium via
`playwright install --with-deps chromium`.

### 6. Coverage gates motivation, not quality

Line coverage tells you what was _executed_, not what was _correct_. Use it to
find untested paths, not to declare victory.

Meaningful thresholds (from real projects):

- **Tokio**: 85% line coverage for core scheduler
- **axum**: 90%+ for routing logic
- **Financial core**: aim for 80% branch coverage on calculation paths

Upload to Codecov with `flags:` to separate Rust and TypeScript trends.

### 7. TypeScript property tests with fast-check

`fast-check` mirrors `proptest` for TypeScript. Key arbitraries:

- `fc.string()` — any Unicode string
- `fc.constantFrom(...values)` — pick from a fixed set (e.g. all ActivityTypes)
- `fc.stringMatching(/regex/)` — constrained strings
- `fc.record({...})` — structured objects

**Pattern**: test that pure utility functions never throw for any input:

```ts
fc.assert(
  fc.property(fc.string(), (s) => {
    expect(() => myFunction(s)).not.toThrow();
  }),
);
```

### 8. Inspiration projects

| Project                                                           | Key technique borrowed                           |
| ----------------------------------------------------------------- | ------------------------------------------------ |
| [rust/std](https://github.com/rust-lang/rust)                     | Kani harnesses for stdlib safety proofs          |
| [s2n-tls](https://github.com/aws/s2n-tls)                         | Kani for cryptographic arithmetic bounds         |
| [Firecracker](https://github.com/firecracker-microvm/firecracker) | Property tests for device emulation invariants   |
| [axum](https://github.com/tokio-rs/axum)                          | insta snapshots for response shape regressions   |
| [tokio](https://github.com/tokio-rs/tokio)                        | llvm-cov nightly coverage with Codecov upload    |
| [Hypothesis](https://github.com/HypothesisWorks/hypothesis)       | "shrinking" — reduce failures to minimal example |
| [diesel](https://github.com/diesel-rs/diesel)                     | embed_migrations! round-trip in test suite       |

---

## CI Structure

```
PR Check (fast — every commit)
├── cargo check
├── cargo test (unit + integration)
├── pnpm type-check
├── pnpm lint
├── pnpm test (Vitest, incl. property tests 100 cases)
└── cargo test -- property (proptest 100 cases)

Nightly (slow — thorough)
├── rust-coverage       → Codecov (lcov)
├── ts-coverage         → Codecov (lcov)
├── snapshot-regression → insta review
├── property-tests      → 10 000 cases (PROPTEST_CASES=10000)
├── kani                → formal verification
├── e2e                 → Playwright (web mode, headless)
└── migration-integrity → round-trip test
```

---

## File Locations

```
crates/core/tests/
├── portfolio_regression.rs    # insta snapshots (Activity, AccountStateSnapshot)
├── bank_connect_property.rs   # proptest (BankKey, BankConnectSettings)
└── kani_proofs.rs             # Kani harnesses (financial arithmetic)

crates/storage-sqlite/tests/
└── migration_integrity.rs     # Diesel migration round-trip

apps/frontend/src/lib/
└── activity-utils.property.test.ts  # fast-check (utility predicates)

.github/workflows/
├── pr-check.yml               # Fast CI: check + test + lint
└── nightly.yml                # Slow CI: coverage + fuzzing + E2E + Kani
```
