//! Eval run results: one record per trial, per-case aggregation (pass^k),
//! the JSON results file, and the paired comparison of two runs.
//!
//! A case run k times passes^k when every trial passed: the reliability a
//! user sees, since they get one reply, not the best of k. P0 gating uses it.
//! Rates come with a standard error across cases, so a change between two
//! runs can be told apart from sampling noise.

use serde::{Deserialize, Serialize};

use crate::live_evals::runner::CaseResult;
use crate::live_evals::schema::Severity;
use crate::types::UsageStats;

/// Bump when a field changes meaning; `compare` refuses other versions.
pub const RESULTS_SCHEMA_VERSION: u32 = 1;

/// Kept per trial so a results file stays readable next to its report.
const FINAL_TEXT_MAX_CHARS: usize = 2_000;

/// What the binary writes to the results file.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunResults {
    pub schema_version: u32,
    /// RFC 3339 start time.
    pub started_at: String,
    pub provider: String,
    pub model: String,
    /// `WF_EVAL_THINKING`; `None` when the run kept the app's choice.
    pub thinking_override: Option<bool>,
    /// Whether the model thought, after the override.
    pub thinking: bool,
    pub judge_provider: String,
    /// `None`: each case's `judge_model`, else the model under test.
    pub judge_model: Option<String>,
    pub trials: u32,
    pub filter: Option<String>,
    pub wall_ms: u64,
    pub cases: Vec<CaseRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CaseRecord {
    pub id: String,
    pub suite: String,
    pub severity: Severity,
    pub trials: Vec<TrialRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrialRecord {
    pub passed: bool,
    pub failures: Vec<FailureRecord>,
    pub tool_calls: Vec<String>,
    pub wall_ms: u64,
    pub attempts: u32,
    pub usage: Option<UsageStats>,
    pub final_text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FailureRecord {
    pub kind: String,
    pub message: String,
}

impl TrialRecord {
    pub fn from_result(result: &CaseResult) -> Self {
        Self {
            passed: result.passed,
            failures: result
                .failures
                .iter()
                .map(|f| FailureRecord {
                    kind: format!("{:?}", f.kind),
                    message: f.message.clone(),
                })
                .collect(),
            tool_calls: result.trace.names().into_iter().map(String::from).collect(),
            wall_ms: result.wall_time.as_millis() as u64,
            attempts: result.attempts,
            usage: result.trace.usage.clone(),
            final_text: result
                .trace
                .final_text
                .chars()
                .take(FINAL_TEXT_MAX_CHARS)
                .collect(),
        }
    }
}

impl CaseRecord {
    pub fn passes(&self) -> usize {
        self.trials.iter().filter(|t| t.passed).count()
    }

    pub fn pass_rate(&self) -> f64 {
        if self.trials.is_empty() {
            0.0
        } else {
            self.passes() as f64 / self.trials.len() as f64
        }
    }

    /// pass^k: every trial passed.
    pub fn passed_all(&self) -> bool {
        !self.trials.is_empty() && self.passes() == self.trials.len()
    }

    /// Passed some trials and failed others.
    pub fn is_flaky(&self) -> bool {
        let passes = self.passes();
        passes > 0 && passes < self.trials.len()
    }

    /// A P0 case that failed any trial fails the run.
    pub fn is_blocking(&self) -> bool {
        self.severity == Severity::P0 && !self.passed_all()
    }
}

/// Run-level counts and sums.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct RunTotals {
    pub cases: usize,
    pub trials: usize,
    pub passed_trials: usize,
    /// Cases that passed every trial (pass^k).
    pub passed_all: usize,
    /// Cases that passed at least one trial (pass@k).
    pub passed_any: usize,
    pub flaky: usize,
    pub p0_cases: usize,
    pub p0_passed_all: usize,
    /// Non-P0 cases that failed a trial.
    pub soft_failures: usize,
    /// Mean of the per-case pass rates.
    pub mean_pass_rate: f64,
    /// Standard error of that mean across cases; `None` below two cases.
    pub pass_rate_std_err: Option<f64>,
    pub usage: UsageTotals,
}

/// Sums over every trial. A counter stays `None` when no trial reported it.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct UsageTotals {
    pub input_tokens: Option<u64>,
    pub cached_input_tokens: Option<u64>,
    pub output_tokens: Option<u64>,
    pub model_calls: u64,
    pub tool_calls: u64,
    pub wall_ms: u64,
    /// Trials that needed a retry after a transport error.
    pub retried_trials: u64,
}

impl UsageTotals {
    pub fn add(&mut self, trial: &TrialRecord) {
        fn sum(total: &mut Option<u64>, value: Option<u64>) {
            if let Some(value) = value {
                *total = Some(total.unwrap_or(0) + value);
            }
        }
        if let Some(usage) = &trial.usage {
            sum(&mut self.input_tokens, usage.input_tokens);
            sum(&mut self.cached_input_tokens, usage.cached_input_tokens);
            sum(&mut self.output_tokens, usage.output_tokens);
            self.model_calls += u64::from(usage.model_calls);
        }
        self.tool_calls += trial.tool_calls.len() as u64;
        self.wall_ms += trial.wall_ms;
        self.retried_trials += u64::from(trial.attempts > 1);
    }
}

/// Write the results file, creating its directory.
pub fn write_results(path: &std::path::Path, results: &RunResults) -> std::io::Result<()> {
    if let Some(parent) = path.parent().filter(|p| !p.as_os_str().is_empty()) {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(path, serde_json::to_string_pretty(results)?)
}

pub fn case_usage(case: &CaseRecord) -> UsageTotals {
    let mut totals = UsageTotals::default();
    for trial in &case.trials {
        totals.add(trial);
    }
    totals
}

pub fn totals(cases: &[CaseRecord]) -> RunTotals {
    let mut totals = RunTotals {
        cases: cases.len(),
        ..RunTotals::default()
    };
    for case in cases {
        totals.trials += case.trials.len();
        totals.passed_trials += case.passes();
        totals.passed_all += usize::from(case.passed_all());
        totals.passed_any += usize::from(case.passes() > 0);
        totals.flaky += usize::from(case.is_flaky());
        if case.severity == Severity::P0 {
            totals.p0_cases += 1;
            totals.p0_passed_all += usize::from(case.passed_all());
        } else if !case.passed_all() {
            totals.soft_failures += 1;
        }
        for trial in &case.trials {
            totals.usage.add(trial);
        }
    }
    let rates: Vec<f64> = cases.iter().map(CaseRecord::pass_rate).collect();
    (totals.mean_pass_rate, totals.pass_rate_std_err) = mean_and_std_err(&rates);
    totals
}

/// Mean and standard error of the mean (sample standard deviation / √n).
fn mean_and_std_err(values: &[f64]) -> (f64, Option<f64>) {
    let n = values.len();
    if n == 0 {
        return (0.0, None);
    }
    let mean = values.iter().sum::<f64>() / n as f64;
    if n < 2 {
        return (mean, None);
    }
    let variance = values.iter().map(|v| (v - mean).powi(2)).sum::<f64>() / (n - 1) as f64;
    (mean, Some((variance / n as f64).sqrt()))
}

/// One case present in both runs.
#[derive(Debug, Clone, PartialEq)]
pub struct CaseDelta {
    pub id: String,
    pub severity: Severity,
    /// (passes, trials) before and after.
    pub before: (usize, usize),
    pub after: (usize, usize),
}

/// Two runs paired by case id.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct Comparison {
    /// Failed a trial before, passed every trial after.
    pub fixed: Vec<CaseDelta>,
    /// Passed every trial before, failed a trial after.
    pub regressed: Vec<CaseDelta>,
    /// pass^k unchanged but the pass rate moved.
    pub rate_changed: Vec<CaseDelta>,
    pub only_before: Vec<String>,
    pub only_after: Vec<String>,
    pub paired: usize,
    pub before_passed_all: usize,
    pub after_passed_all: usize,
    /// Mean over paired cases of (after rate − before rate).
    pub mean_rate_diff: f64,
    /// Standard error of that mean; `None` below two paired cases.
    pub rate_diff_std_err: Option<f64>,
}

pub fn compare(before: &RunResults, after: &RunResults) -> Comparison {
    let mut comparison = Comparison::default();
    let mut diffs = Vec::new();
    for b in &before.cases {
        let Some(a) = after.cases.iter().find(|a| a.id == b.id) else {
            comparison.only_before.push(b.id.clone());
            continue;
        };
        comparison.paired += 1;
        comparison.before_passed_all += usize::from(b.passed_all());
        comparison.after_passed_all += usize::from(a.passed_all());
        diffs.push(a.pass_rate() - b.pass_rate());

        let delta = CaseDelta {
            id: b.id.clone(),
            severity: a.severity,
            before: (b.passes(), b.trials.len()),
            after: (a.passes(), a.trials.len()),
        };
        match (b.passed_all(), a.passed_all()) {
            (false, true) => comparison.fixed.push(delta),
            (true, false) => comparison.regressed.push(delta),
            _ if a.pass_rate() != b.pass_rate() => comparison.rate_changed.push(delta),
            _ => {}
        }
    }
    comparison.only_after = after
        .cases
        .iter()
        .filter(|a| !before.cases.iter().any(|b| b.id == a.id))
        .map(|a| a.id.clone())
        .collect();
    (comparison.mean_rate_diff, comparison.rate_diff_std_err) = mean_and_std_err(&diffs);
    comparison
}

#[cfg(test)]
mod tests {
    use super::*;

    fn trial(passed: bool) -> TrialRecord {
        TrialRecord {
            passed,
            failures: Vec::new(),
            tool_calls: vec!["get_holdings".to_string()],
            wall_ms: 1_000,
            attempts: 1,
            usage: Some(UsageStats {
                provider_id: "ollama".to_string(),
                model_id: "m".to_string(),
                model_calls: 2,
                input_tokens: Some(100),
                output_tokens: Some(10),
                ..UsageStats::default()
            }),
            final_text: String::new(),
        }
    }

    fn case(id: &str, severity: Severity, outcomes: &[bool]) -> CaseRecord {
        CaseRecord {
            id: id.to_string(),
            suite: "suite".to_string(),
            severity,
            trials: outcomes.iter().map(|&p| trial(p)).collect(),
        }
    }

    fn run(cases: Vec<CaseRecord>) -> RunResults {
        RunResults {
            schema_version: RESULTS_SCHEMA_VERSION,
            started_at: "2026-10-18T00:00:00Z".to_string(),
            provider: "ollama".to_string(),
            model: "m".to_string(),
            thinking_override: None,
            thinking: false,
            judge_provider: "ollama".to_string(),
            judge_model: None,
            trials: 3,
            filter: None,
            wall_ms: 0,
            cases,
        }
    }

    #[test]
    fn pass_all_needs_every_trial_and_flaky_needs_a_mix() {
        let all = case("a", Severity::P0, &[true, true, true]);
        let some = case("b", Severity::P0, &[true, false, true]);
        let none = case("c", Severity::P1, &[false, false, false]);
        let empty = case("d", Severity::P0, &[]);

        assert!(all.passed_all() && !all.is_flaky() && !all.is_blocking());
        assert!(!some.passed_all() && some.is_flaky() && some.is_blocking());
        assert!(!none.passed_all() && !none.is_flaky() && !none.is_blocking());
        assert!(!empty.passed_all() && empty.is_blocking());
        assert!((some.pass_rate() - 2.0 / 3.0).abs() < 1e-12);
    }

    #[test]
    fn totals_count_pass_k_pass_at_k_p0_gating_and_usage() {
        let cases = vec![
            case("a", Severity::P0, &[true, true, true]),
            case("b", Severity::P0, &[true, false, true]),
            case("c", Severity::P1, &[false, false, false]),
            case("d", Severity::P2, &[true, true, true]),
        ];
        let t = totals(&cases);

        assert_eq!((t.cases, t.trials, t.passed_trials), (4, 12, 8), "{t:?}");
        assert_eq!((t.passed_all, t.passed_any, t.flaky), (2, 3, 1));
        assert_eq!((t.p0_cases, t.p0_passed_all, t.soft_failures), (2, 1, 1));
        // Rates 1, 2/3, 0, 1: mean 2/3, sample sd 0.4714, SE 0.2357.
        assert!((t.mean_pass_rate - 2.0 / 3.0).abs() < 1e-12);
        assert!((t.pass_rate_std_err.unwrap() - 0.235_702).abs() < 1e-6);
        assert_eq!(
            t.usage,
            UsageTotals {
                input_tokens: Some(1_200),
                cached_input_tokens: None,
                output_tokens: Some(120),
                model_calls: 24,
                tool_calls: 12,
                wall_ms: 12_000,
                retried_trials: 0,
            }
        );
    }

    #[test]
    fn a_single_case_has_no_standard_error() {
        let t = totals(&[case("a", Severity::P1, &[true])]);
        assert_eq!((t.mean_pass_rate, t.pass_rate_std_err), (1.0, None));
        assert_eq!(totals(&[]).pass_rate_std_err, None);
    }

    #[test]
    fn compare_lists_flips_rate_changes_and_unpaired_cases() {
        let before = run(vec![
            case("fixed", Severity::P0, &[true, false, true]),
            case("regressed", Severity::P0, &[true, true, true]),
            case("moved", Severity::P1, &[false, false, false]),
            case("same", Severity::P1, &[true, true, true]),
            case("dropped", Severity::P1, &[true]),
        ]);
        let after = run(vec![
            case("same", Severity::P1, &[true, true, true]),
            case("fixed", Severity::P0, &[true, true, true]),
            case("regressed", Severity::P0, &[true, true, false]),
            case("moved", Severity::P1, &[true, false, false]),
            case("added", Severity::P1, &[true]),
        ]);
        let c = compare(&before, &after);

        let ids = |deltas: &[CaseDelta]| deltas.iter().map(|d| d.id.clone()).collect::<Vec<_>>();
        assert_eq!(ids(&c.fixed), ["fixed"]);
        assert_eq!(c.fixed[0].before, (2, 3));
        assert_eq!(c.fixed[0].after, (3, 3));
        assert_eq!(ids(&c.regressed), ["regressed"]);
        assert_eq!(ids(&c.rate_changed), ["moved"]);
        assert_eq!(c.only_before, ["dropped"]);
        assert_eq!(c.only_after, ["added"]);
        assert_eq!(
            (c.paired, c.before_passed_all, c.after_passed_all),
            (4, 2, 2)
        );
        // Diffs +1/3, −1/3, +1/3, 0.
        assert!((c.mean_rate_diff - 1.0 / 12.0).abs() < 1e-12);
        assert!(c.rate_diff_std_err.is_some());
    }

    #[test]
    fn writes_results_into_a_new_directory_and_reports_an_unwritable_path() {
        let dir = std::env::temp_dir().join(format!("wf-eval-results-{}", std::process::id()));
        let results = run(vec![case("a", Severity::P0, &[true])]);
        let path = dir.join("nested/run.json");
        write_results(&path, &results).unwrap();
        let back: RunResults =
            serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
        assert_eq!(back.cases[0].id, "a");

        // A file where the directory should be.
        assert!(write_results(&path.join("run.json"), &results).is_err());
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn results_round_trip_through_json() {
        let results = run(vec![case("a", Severity::P0, &[true, false])]);
        let json = serde_json::to_string(&results).unwrap();
        assert!(json.contains(r#""severity":"P0""#), "{json}");
        let back: RunResults = serde_json::from_str(&json).unwrap();
        assert_eq!(back.cases[0].passes(), 1);
        assert_eq!(
            back.cases[0].trials[0].usage,
            results.cases[0].trials[0].usage
        );
    }
}
