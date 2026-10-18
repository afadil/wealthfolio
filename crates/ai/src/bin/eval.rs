//! Live-model eval runner.
//!
//! Reads TOML eval suites from `crates/ai/evals/cases/`, runs each case
//! through `ChatService` against the configured LLM provider (Ollama by
//! default, model = `gemma4:e4b` unless `WF_EVAL_MODEL` is set) one or more
//! times, reports pass counts, pass^k and usage per case, and writes the run
//! to a JSON results file.
//!
//! Build/run:
//!     cargo run -p wealthfolio-ai --bin eval --features eval
//!     cargo run -p wealthfolio-ai --bin eval --features eval -- compare <before.json> <after.json>
//!
//! Environment:
//!     WF_EVAL_PROVIDER       - rig provider id (default: ollama)
//!     WF_EVAL_MODEL          - model name      (default: gemma4:e4b)
//!     WF_EVAL_PROVIDER_URL   - provider base URL (default: http://localhost:11434 for ollama)
//!     WF_EVAL_THINKING       - on / off: force the model's thinking (default: the app's choice)
//!     WF_EVAL_TRIALS         - runs per case (default: 1); P0 gating needs every run to pass
//!     WF_EVAL_JUDGE_PROVIDER - provider that grades rubrics (default: WF_EVAL_PROVIDER)
//!     WF_EVAL_JUDGE_MODEL    - judge model (default: the case's judge_model, else WF_EVAL_MODEL)
//!     WF_EVAL_JUDGE_PROVIDER_URL - judge base URL
//!     WF_EVAL_RESULTS        - results file (default: target/eval-results/<time>-<model>.json)
//!     WF_EVAL_FILTER         - substring filter on case id
//!     WF_EVAL_CASES_DIR      - override cases directory
//!
//! See `crates/ai/README.md` and `crates/ai/evals/README.md` for full docs.

use std::path::{Path, PathBuf};
use std::process::ExitCode;
use std::time::Instant;

use wealthfolio_ai::live_evals::report::{
    case_usage, compare, totals, CaseDelta, CaseRecord, RunResults, TrialRecord, UsageTotals,
    RESULTS_SCHEMA_VERSION,
};
use wealthfolio_ai::live_evals::runner::{run_case, RunnerConfig};
use wealthfolio_ai::live_evals::schema::{load_all_suites, Severity};

/// Default model when WF_EVAL_MODEL isn't set. Pinned here so the suite is
/// reproducible against a specific local model — change at one site.
/// Override at runtime: `WF_EVAL_MODEL=other-model cargo run --bin eval --features eval`.
const DEFAULT_MODEL: &str = "gemma4:e4b";

const USAGE: &str = "usage: eval                                 run the suite (WF_EVAL_* env vars)
       eval compare <before.json> <after.json>  list cases whose result changed";

#[tokio::main]
async fn main() -> ExitCode {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();

    let args: Vec<String> = std::env::args().skip(1).collect();
    match args.as_slice() {
        [] => run().await,
        [command, before, after] if command == "compare" => {
            compare_files(Path::new(before), Path::new(after))
        }
        _ => {
            eprintln!("{USAGE}");
            ExitCode::from(2)
        }
    }
}

async fn run() -> ExitCode {
    let cases_dir = std::env::var("WF_EVAL_CASES_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| {
            // Crate dir is the parent of the binary's target/. We resolve via CARGO_MANIFEST_DIR
            // when available (cargo run sets it), otherwise fall back to ./crates/ai/evals/cases.
            std::env::var("CARGO_MANIFEST_DIR")
                .map(|m| PathBuf::from(m).join("evals").join("cases"))
                .unwrap_or_else(|_| PathBuf::from("crates/ai/evals/cases"))
        });

    let filter = std::env::var("WF_EVAL_FILTER").ok();
    let mut cfg = match RunnerConfig::from_env(DEFAULT_MODEL) {
        Ok(cfg) => cfg,
        Err(e) => {
            eprintln!("{e}");
            return ExitCode::from(2);
        }
    };
    if let Err(e) = cfg.load_listed_capabilities().await {
        eprintln!("{e}");
        return ExitCode::from(2);
    }
    let trials = match std::env::var("WF_EVAL_TRIALS") {
        Err(_) => 1,
        Ok(value) => match value.parse::<u32>() {
            Ok(n) if n > 0 => n,
            _ => {
                eprintln!("WF_EVAL_TRIALS must be a positive number, got `{value}`");
                return ExitCode::from(2);
            }
        },
    };
    let started_at = chrono::Utc::now();
    let results_path = std::env::var("WF_EVAL_RESULTS")
        .map(PathBuf::from)
        .unwrap_or_else(|_| default_results_path(&cfg, started_at));
    let capabilities = cfg.effective_capabilities();

    println!("==> Live eval run");
    println!("    provider: {}", cfg.provider);
    println!("    model:    {}", cfg.model);
    println!(
        "    model capabilities: tools={} thinking={} vision={}{}",
        capabilities.tools,
        capabilities.thinking,
        capabilities.vision,
        match cfg.thinking {
            Some(_) => " (thinking forced by WF_EVAL_THINKING)",
            None => "",
        }
    );
    if let Some(url) = &cfg.provider_url {
        println!("    url:      {url}");
    }
    println!(
        "    judge:    {} / {}",
        cfg.judge.provider,
        cfg.judge
            .model
            .as_deref()
            .unwrap_or("case judge_model, else the model under test")
    );
    println!("    trials:   {trials}");
    println!("    cases:    {}", cases_dir.display());
    if let Some(f) = &filter {
        println!("    filter:   {f}");
    }
    println!("    results:  {}", results_path.display());
    println!();

    let suites = match load_all_suites(&cases_dir) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("Failed to load suites: {e}");
            return ExitCode::from(2);
        }
    };

    let run_started = Instant::now();
    let mut records: Vec<CaseRecord> = Vec::new();

    for suite in &suites {
        let suite_name = suite.name.as_deref().unwrap_or("(unnamed)");
        println!("=== Suite: {} ===", suite_name);
        if suite.cases.is_empty() {
            println!("    (no cases)\n");
            continue;
        }
        for case in &suite.cases {
            if let Some(f) = &filter {
                if !case.id.contains(f.as_str()) {
                    continue;
                }
            }
            let mut record = CaseRecord {
                id: case.id.clone(),
                suite: suite_name.to_string(),
                severity: case.severity,
                trials: Vec::new(),
            };
            for _ in 0..trials {
                let result = run_case(case, &cfg).await;
                record.trials.push(TrialRecord::from_result(&result));
            }
            print_case(&record, &case.description);
            records.push(record);
        }
        println!();
    }

    let results = RunResults {
        schema_version: RESULTS_SCHEMA_VERSION,
        started_at: started_at.to_rfc3339(),
        provider: cfg.provider.clone(),
        model: cfg.model.clone(),
        thinking_override: cfg.thinking,
        thinking: capabilities.thinking,
        judge_provider: cfg.judge.provider.clone(),
        judge_model: cfg.judge.model.clone(),
        trials,
        filter,
        wall_ms: run_started.elapsed().as_millis() as u64,
        cases: records,
    };
    print_totals(&results);
    if let Err(e) = write_results(&results_path, &results) {
        eprintln!("Failed to write {}: {e}", results_path.display());
    }

    if results.cases.iter().any(CaseRecord::is_blocking) {
        ExitCode::from(1)
    } else {
        ExitCode::SUCCESS
    }
}

fn default_results_path(cfg: &RunnerConfig, started_at: chrono::DateTime<chrono::Utc>) -> PathBuf {
    let model: String = cfg
        .model
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect();
    let thinking = match cfg.thinking {
        Some(true) => "-think-on",
        Some(false) => "-think-off",
        None => "",
    };
    PathBuf::from("target/eval-results").join(format!(
        "{}-{model}{thinking}.json",
        started_at.format("%Y%m%dT%H%M%SZ")
    ))
}

fn write_results(path: &Path, results: &RunResults) -> std::io::Result<()> {
    if let Some(parent) = path.parent().filter(|p| !p.as_os_str().is_empty()) {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(path, serde_json::to_string_pretty(results)?)?;
    println!("    results written to {}", path.display());
    Ok(())
}

fn print_case(record: &CaseRecord, description: &str) {
    let k = record.trials.len();
    let icon = if record.passed_all() {
        "✓"
    } else if matches!(record.severity, Severity::P0) {
        "✗"
    } else {
        "·"
    };
    let count = if k > 1 {
        format!("  {}/{k}", record.passes())
    } else {
        String::new()
    };
    println!(
        "  {icon} {}  [{:?}]{count}  {}",
        record.id,
        record.severity,
        usage_line(&case_usage(record), k)
    );
    if record.passed_all() {
        return;
    }
    println!("      \"{description}\"");
    for (index, trial) in record.trials.iter().enumerate() {
        if trial.passed {
            continue;
        }
        let indent = if k > 1 {
            println!("      trial {}:", index + 1);
            "        "
        } else {
            "      "
        };
        for failure in &trial.failures {
            println!("{indent}- [{}] {}", failure.kind, failure.message);
        }
        let trace = if trial.tool_calls.is_empty() {
            "(no tool calls)".to_string()
        } else {
            trial.tool_calls.join(" → ")
        };
        println!("{indent}trace: {trace}");
    }
}

/// Per-trial means of the case's usage.
fn usage_line(usage: &UsageTotals, trials: usize) -> String {
    let n = trials.max(1) as u64;
    let per = |value: Option<u64>| value.map_or("—".to_string(), |v| tokens(v / n));
    format!(
        "in {} (cached {}) · out {} · {} model call(s) · {} tool call(s) · {:.1} s{}",
        per(usage.input_tokens),
        per(usage.cached_input_tokens),
        per(usage.output_tokens),
        usage.model_calls / n,
        usage.tool_calls / n,
        usage.wall_ms as f64 / n as f64 / 1000.0,
        if trials > 1 { " per trial" } else { "" }
    )
}

fn tokens(value: u64) -> String {
    match value {
        v if v >= 1_000_000 => format!("{:.1}M", v as f64 / 1e6),
        v if v >= 10_000 => format!("{:.0}k", v as f64 / 1e3),
        v if v >= 1_000 => format!("{:.1}k", v as f64 / 1e3),
        v => v.to_string(),
    }
}

fn duration(ms: u64) -> String {
    let secs = ms / 1000;
    if secs >= 60 {
        format!("{}m {:02}s", secs / 60, secs % 60)
    } else {
        format!("{:.1}s", ms as f64 / 1000.0)
    }
}

fn percent(rate: f64, std_err: Option<f64>) -> String {
    match std_err {
        Some(se) => format!("{:.1}% ± {:.1}%", rate * 100.0, se * 100.0),
        None => format!("{:.1}%", rate * 100.0),
    }
}

fn print_totals(results: &RunResults) {
    let t = totals(&results.cases);
    let k = results.trials;
    if k > 1 {
        println!(
            "==> pass^{k}: {}/{} cases passed every trial · pass@{k}: {} · flaky: {}",
            t.passed_all, t.cases, t.passed_any, t.flaky
        );
        println!(
            "    trials: {}/{} passed · mean pass rate {} (SE across cases)",
            t.passed_trials,
            t.trials,
            percent(t.mean_pass_rate, t.pass_rate_std_err)
        );
    } else {
        println!("==> {}/{} passed", t.passed_all, t.cases);
    }
    let blocking = t.p0_cases - t.p0_passed_all;
    println!(
        "    P0: {}/{} passed{}",
        t.p0_passed_all,
        t.p0_cases,
        if k > 1 { " every trial" } else { "" }
    );
    if blocking > 0 {
        println!("    {blocking} P0 failure(s) — blocking");
    }
    if t.soft_failures > 0 {
        println!("    {} P1/P2 failure(s) — non-blocking", t.soft_failures);
    }
    let u = &t.usage;
    let total = |value: Option<u64>| value.map_or("—".to_string(), tokens);
    println!(
        "    usage: in {} (cached {}) · out {} · {} model calls · {} tool calls · chat {} · run {}",
        total(u.input_tokens),
        total(u.cached_input_tokens),
        total(u.output_tokens),
        u.model_calls,
        u.tool_calls,
        duration(u.wall_ms),
        duration(results.wall_ms)
    );
}

fn compare_files(before_path: &Path, after_path: &Path) -> ExitCode {
    let read = |path: &Path| -> Result<RunResults, String> {
        let text = std::fs::read_to_string(path).map_err(|e| format!("{}: {e}", path.display()))?;
        let results: RunResults =
            serde_json::from_str(&text).map_err(|e| format!("{}: {e}", path.display()))?;
        if results.schema_version != RESULTS_SCHEMA_VERSION {
            return Err(format!(
                "{}: results schema {} (this runner reads {RESULTS_SCHEMA_VERSION})",
                path.display(),
                results.schema_version
            ));
        }
        Ok(results)
    };
    let (before, after) = match (read(before_path), read(after_path)) {
        (Ok(before), Ok(after)) => (before, after),
        (Err(e), _) | (_, Err(e)) => {
            eprintln!("{e}");
            return ExitCode::from(2);
        }
    };

    let describe = |r: &RunResults| {
        format!(
            "{} / {} (thinking {}), {} trial(s), started {}",
            r.provider,
            r.model,
            if r.thinking { "on" } else { "off" },
            r.trials,
            r.started_at
        )
    };
    let c = compare(&before, &after);
    println!("==> Compare");
    println!("    before: {}", describe(&before));
    println!("    after:  {}", describe(&after));
    println!(
        "    passed every trial: {} → {} of {} paired cases",
        c.before_passed_all, c.after_passed_all, c.paired
    );
    println!(
        "    mean pass rate change: {}{} (paired SE across cases)",
        if c.mean_rate_diff >= 0.0 { "+" } else { "" },
        percent(c.mean_rate_diff, c.rate_diff_std_err)
    );
    let list = |title: &str, sign: &str, deltas: &[CaseDelta]| {
        if deltas.is_empty() {
            return;
        }
        println!("    {title} ({}):", deltas.len());
        for d in deltas {
            println!(
                "      {sign} {}  [{:?}]  {}/{} → {}/{}",
                d.id, d.severity, d.before.0, d.before.1, d.after.0, d.after.1
            );
        }
    };
    list("fixed", "+", &c.fixed);
    list("regressed", "-", &c.regressed);
    list("pass rate changed", "~", &c.rate_changed);
    if !c.only_before.is_empty() {
        println!("    only in before: {}", c.only_before.join(", "));
    }
    if !c.only_after.is_empty() {
        println!("    only in after:  {}", c.only_after.join(", "));
    }
    ExitCode::SUCCESS
}
