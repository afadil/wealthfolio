#![allow(clippy::unwrap_used, clippy::panic, reason = "test code")]

use async_trait::async_trait;
use chrono::NaiveDate;
use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicUsize, Ordering},
        Arc,
    },
    thread::ThreadId,
    time::Duration,
};
use tempfile::tempdir;
use wealthfolio_core::{
    errors::Result,
    portfolio::{
        coordinator::{PortfolioJobRequest, SilentObserver},
        valuation::{DailyAccountValuation, NegativeBalanceInfo, ValuationServiceTrait},
    },
    quotes::MarketSyncMode,
};
use wealthfolio_server::{build_state, config::Config};

struct CheckedValuations {
    inner: Arc<dyn ValuationServiceTrait>,
    async_worker: ThreadId,
    history_reads: Arc<AtomicUsize>,
}

impl CheckedValuations {
    fn check_history_thread(&self) {
        assert_ne!(
            std::thread::current().id(),
            self.async_worker,
            "fresh health history reads held the async worker"
        );
        self.history_reads.fetch_add(1, Ordering::SeqCst);
    }
}

#[async_trait]
impl ValuationServiceTrait for CheckedValuations {
    fn get_historical_valuations(
        &self,
        account: &str,
        start: Option<NaiveDate>,
        end: Option<NaiveDate>,
    ) -> Result<Vec<DailyAccountValuation>> {
        self.inner.get_historical_valuations(account, start, end)
    }

    fn get_historical_valuations_by_account(
        &self,
        accounts: &[String],
        start: Option<NaiveDate>,
        end: Option<NaiveDate>,
    ) -> Result<HashMap<String, Vec<DailyAccountValuation>>> {
        self.check_history_thread();
        self.inner
            .get_historical_valuations_by_account(accounts, start, end)
    }

    async fn get_historical_valuations_for_accounts(
        &self,
        scope: &str,
        accounts: &[String],
        currency: &str,
        start: Option<NaiveDate>,
        end: Option<NaiveDate>,
    ) -> Result<Vec<DailyAccountValuation>> {
        self.inner
            .get_historical_valuations_for_accounts(scope, accounts, currency, start, end)
            .await
    }

    async fn get_historical_valuation_totals_for_accounts(
        &self,
        scope: &str,
        accounts: &[String],
        currency: &str,
        start: Option<NaiveDate>,
        end: Option<NaiveDate>,
    ) -> Result<Vec<DailyAccountValuation>> {
        self.inner
            .get_historical_valuation_totals_for_accounts(scope, accounts, currency, start, end)
            .await
    }

    fn get_latest_valuations(&self, accounts: &[String]) -> Result<Vec<DailyAccountValuation>> {
        self.inner.get_latest_valuations(accounts)
    }

    fn get_valuations_on_date(
        &self,
        accounts: &[String],
        date: NaiveDate,
    ) -> Result<Vec<DailyAccountValuation>> {
        self.inner.get_valuations_on_date(accounts, date)
    }

    fn get_accounts_with_negative_balance(
        &self,
        accounts: &[String],
    ) -> Result<Vec<NegativeBalanceInfo>> {
        self.check_history_thread();
        self.inner.get_accounts_with_negative_balance(accounts)
    }
}

#[tokio::test]
async fn fresh_health_reads_history_off_the_async_worker_and_populates_its_cache() {
    let temp = tempdir().unwrap();
    std::env::set_var("WF_SECRET_FILE", temp.path().join("secrets.json"));
    let config = Config {
        listen_addr: "127.0.0.1:0".parse().unwrap(),
        db_path: temp.path().join("app.db").to_string_lossy().into_owned(),
        cors_allow: vec!["*".into()],
        request_timeout: Duration::from_secs(30),
        static_dir: "dist".into(),
        addons_root: temp.path().join("addons").to_string_lossy().into_owned(),
        raw_secret_key: vec![7; 32],
        secrets_encryption_key: [7; 32],
        database_key: [9; 32],
        db_encryption_required: false,
        auth: None,
        oidc: None,
        mcp_enabled: false,
        mcp_audit_enabled: true,
        mcp_allowed_hosts: None,
    };
    let state = build_state(&config).await.unwrap();
    tokio::task::yield_now().await;
    state
        .portfolio_coordinator
        .run_job(
            PortfolioJobRequest {
                market_sync: MarketSyncMode::None,
                ..Default::default()
            },
            &SilentObserver,
        )
        .await
        .unwrap();
    tokio::task::yield_now().await;
    state
        .db_access
        .connect_rusqlite()
        .unwrap()
        .execute_batch(
            "INSERT INTO accounts (id,name,account_type,currency,tracking_mode)
         VALUES ('health-test','Synthetic account','SECURITIES','USD','TRANSACTIONS');",
        )
        .unwrap();
    let history_reads = Arc::new(AtomicUsize::new(0));
    let valuations = Arc::new(CheckedValuations {
        inner: state.valuation_service.clone(),
        async_worker: std::thread::current().id(),
        history_reads: history_reads.clone(),
    });
    let status = state
        .health_service
        .run_full_checks(
            "USD",
            state.account_service.clone(),
            state.holdings_service.clone(),
            state.quote_service.clone(),
            state.asset_service.clone(),
            state.taxonomy_service.clone(),
            valuations,
            state.snapshot_service.clone(),
            state.activity_service.clone(),
            state.lots_repository.clone(),
            Some("UTC"),
            None,
        )
        .await
        .unwrap();
    assert_eq!(history_reads.load(Ordering::SeqCst), 2);
    let cached = state.health_service.get_cached_status().await.unwrap();
    assert_eq!(cached.checked_at, status.checked_at);
    assert_eq!(cached.total_count(), status.total_count());
    assert!(!cached.is_stale);
    state.health_service.clear_cache().await;
    assert!(state.health_service.get_cached_status().await.is_none());
}
