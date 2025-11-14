use std::path::PathBuf;
use std::sync::{Arc, RwLock};

use crate::{auth::AuthManager, config::Config, events::EventBus, secrets::build_secret_store};
use tracing_subscriber::prelude::*;
use tracing_subscriber::{fmt, EnvFilter};
use wealthfolio_core::{
    accounts::{AccountRepository, AccountService},
    activities::{
        ActivityRepository, ActivityService as CoreActivityService, ActivityServiceTrait,
    },
    assets::{AssetRepository, AssetService, AssetServiceTrait},
    db::{self, write_actor},
    fx::{FxRepository, FxService, FxServiceTrait},
    goals::{GoalRepository, GoalService, GoalServiceTrait},
    limits::{
        ContributionLimitRepository, ContributionLimitService, ContributionLimitServiceTrait,
    },
    market_data::{MarketDataRepository, MarketDataService, MarketDataServiceTrait},
    portfolio::income::{IncomeService, IncomeServiceTrait},
    portfolio::{
        holdings::{
            holdings_valuation_service::HoldingsValuationService, HoldingsService,
            HoldingsServiceTrait,
        },
        snapshot::{SnapshotRepository, SnapshotService, SnapshotServiceTrait},
        valuation::{ValuationRepository, ValuationService, ValuationServiceTrait},
    },
    secrets::SecretStore,
    settings::{settings_repository::SettingsRepository, SettingsService, SettingsServiceTrait},
};

#[cfg(feature = "wealthfolio-pro")]
use wealthfolio_core::sync::store;

pub struct AppState {
    pub account_service: Arc<AccountService<Arc<db::DbPool>>>,
    pub settings_service: Arc<SettingsService>,
    pub holdings_service: Arc<dyn HoldingsServiceTrait + Send + Sync>,
    pub valuation_service: Arc<dyn ValuationServiceTrait + Send + Sync>,
    pub market_data_service: Arc<dyn MarketDataServiceTrait + Send + Sync>,
    pub base_currency: Arc<RwLock<String>>,
    pub snapshot_service: Arc<dyn SnapshotServiceTrait + Send + Sync>,
    pub performance_service:
        Arc<dyn wealthfolio_core::portfolio::performance::PerformanceServiceTrait + Send + Sync>,
    pub income_service: Arc<dyn IncomeServiceTrait + Send + Sync>,
    pub goal_service: Arc<dyn GoalServiceTrait + Send + Sync>,
    pub limits_service: Arc<dyn ContributionLimitServiceTrait + Send + Sync>,
    pub fx_service: Arc<dyn FxServiceTrait + Send + Sync>,
    pub activity_service: Arc<dyn ActivityServiceTrait + Send + Sync>,
    pub asset_service: Arc<dyn AssetServiceTrait + Send + Sync>,
    pub addons_root: String,
    pub data_root: String,
    pub instance_id: String,
    pub secret_store: Arc<dyn SecretStore>,
    pub event_bus: EventBus,
    pub auth: Option<Arc<AuthManager>>,
}

pub fn init_tracing() {
    let fmt_layer = fmt::layer().json().with_current_span(false);
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));
    tracing_subscriber::registry()
        .with(filter)
        .with(fmt_layer)
        .init();
}

pub async fn build_state(config: &Config) -> anyhow::Result<Arc<AppState>> {
    // Ensure DATABASE_URL aligns with WF_DB_PATH so core picks the right file
    std::env::set_var("DATABASE_URL", &config.db_path);
    let db_path = db::init(&config.db_path)?;
    tracing::info!("Database path in use: {}", db_path);
    let data_root_path = std::path::Path::new(&db_path)
        .parent()
        .unwrap_or_else(|| std::path::Path::new("."))
        .to_path_buf();

    let resolved_secret_path = std::env::var("WF_SECRET_FILE")
        .ok()
        .map(PathBuf::from)
        .unwrap_or_else(|| data_root_path.join("secrets.json"));
    let file_store =
        build_secret_store(resolved_secret_path.clone(), Some(config.secret_key.as_str()))
            .map_err(anyhow::Error::new)?;
    let secret_store: Arc<dyn SecretStore> = Arc::new(file_store);
    std::env::set_var(
        "WF_SECRET_FILE",
        resolved_secret_path.to_string_lossy().to_string(),
    );

    let pool = db::create_pool(&db_path)?;
    db::run_migrations(&pool)?;
    let writer = write_actor::spawn_writer((*pool).clone());

    let fx_repo = Arc::new(FxRepository::new(pool.clone(), writer.clone()));
    let fx_service = Arc::new(FxService::new(fx_repo));
    fx_service.initialize()?;

    let settings_repo = Arc::new(SettingsRepository::new(pool.clone(), writer.clone()));
    let settings_service = Arc::new(SettingsService::new(settings_repo, fx_service.clone()));
    let settings = settings_service.get_settings()?;
    let base_currency = Arc::new(RwLock::new(settings.base_currency));

    // Ensure a device ID exists in the database for trigger stamping (origin/updated_version)
    #[cfg(feature = "wealthfolio-pro")]
    {
        let mut conn = pool.get()?;
        // Record the stable instance_id into sync_device so triggers can reference it
        store::ensure_device_id(&mut conn, &settings.instance_id)?;
    }

    let account_repo = Arc::new(AccountRepository::new(pool.clone(), writer.clone()));
    let transaction_executor = pool.clone();
    let account_service = Arc::new(AccountService::new(
        account_repo.clone(),
        fx_service.clone(),
        transaction_executor,
        base_currency.clone(),
    ));

    // Additional repositories/services for web API
    let asset_repository = Arc::new(AssetRepository::new(pool.clone(), writer.clone()));
    let market_data_repository = Arc::new(MarketDataRepository::new(pool.clone(), writer.clone()));
    let market_data_service = Arc::new(
        MarketDataService::new(
            market_data_repository.clone(),
            asset_repository.clone(),
            secret_store.clone(),
        )
        .await?,
    );

    let asset_service = Arc::new(AssetService::new(
        asset_repository.clone(),
        market_data_service.clone(),
    )?);
    let activity_repository = Arc::new(ActivityRepository::new(pool.clone(), writer.clone()));
    let snapshot_repository = Arc::new(SnapshotRepository::new(pool.clone(), writer.clone()));
    let snapshot_service = Arc::new(SnapshotService::new(
        base_currency.clone(),
        account_repo.clone(),
        activity_repository.clone(),
        snapshot_repository.clone(),
        asset_repository.clone(),
        fx_service.clone(),
    ));

    let valuation_repository = Arc::new(ValuationRepository::new(pool.clone(), writer.clone()));
    let valuation_service = Arc::new(ValuationService::new(
        base_currency.clone(),
        valuation_repository.clone(),
        snapshot_service.clone(),
        market_data_service.clone(),
        fx_service.clone(),
    ));

    let holdings_valuation_service = Arc::new(HoldingsValuationService::new(
        fx_service.clone(),
        market_data_service.clone(),
    ));
    let holdings_service = Arc::new(HoldingsService::new(
        asset_service.clone(),
        snapshot_service.clone(),
        holdings_valuation_service.clone(),
    ));

    let performance_service = Arc::new(
        wealthfolio_core::portfolio::performance::PerformanceService::new(
            valuation_service.clone(),
            market_data_service.clone(),
        ),
    );

    let income_service = Arc::new(IncomeService::new(
        fx_service.clone(),
        activity_repository.clone(),
        base_currency.clone(),
    ));

    let goal_repository = Arc::new(GoalRepository::new(pool.clone(), writer.clone()));
    let goal_service = Arc::new(GoalService::new(goal_repository));

    let limits_repository = Arc::new(ContributionLimitRepository::new(
        pool.clone(),
        writer.clone(),
    ));
    let limits_service: Arc<dyn ContributionLimitServiceTrait + Send + Sync> =
        Arc::new(ContributionLimitService::new(
            fx_service.clone(),
            limits_repository.clone(),
            activity_repository.clone(),
        ));

    let activity_service: Arc<dyn ActivityServiceTrait + Send + Sync> =
        Arc::new(CoreActivityService::new(
            activity_repository.clone(),
            account_service.clone(),
            asset_service.clone(),
            fx_service.clone(),
        ));

    // Determine data root directory (parent of DB path)
    let data_root = data_root_path.to_string_lossy().to_string();

    let event_bus = EventBus::new(256);

    let auth_manager = config
        .auth
        .as_ref()
        .map(AuthManager::new)
        .transpose()?
        .map(Arc::new);

    Ok(Arc::new(AppState {
        account_service,
        settings_service,
        holdings_service,
        valuation_service,
        market_data_service: market_data_service.clone(),
        base_currency,
        snapshot_service,
        performance_service,
        income_service,
        goal_service,
        limits_service,
        fx_service: fx_service.clone(),
        activity_service,
        asset_service,
        addons_root: config.addons_root.clone(),
        data_root,
        instance_id: settings.instance_id,
        secret_store,
        event_bus,
        auth: auth_manager,
    }))
}
