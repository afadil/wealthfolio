use super::registry::ServiceContext;
use crate::secret_store::shared_secret_store;
use std::sync::{Arc, RwLock};
use wealthfolio_connect::{PlatformRepository, SyncService};
use wealthfolio_core::{
    accounts::AccountService,
    activities::ActivityService,
    assets::AssetService,
    fx::{FxService, FxServiceTrait},
    goals::GoalService,
    limits::ContributionLimitService,
    portfolio::{
        holdings::{HoldingsService, HoldingsValuationService},
        income::IncomeService,
        net_worth::NetWorthService,
        performance::PerformanceService,
        snapshot::SnapshotService,
        valuation::ValuationService,
    },
    quotes::{QuoteService, QuoteServiceTrait},
    settings::{SettingsService, SettingsServiceTrait},
};
use wealthfolio_storage_sqlite::{
    accounts::AccountRepository,
    activities::ActivityRepository,
    assets::{AlternativeAssetRepository, AssetRepository},
    db::{self, write_actor},
    fx::FxRepository,
    goals::GoalRepository,
    limits::ContributionLimitRepository,
    market_data::{MarketDataRepository, QuoteSyncStateRepository},
    portfolio::{snapshot::SnapshotRepository, valuation::ValuationRepository},
    settings::SettingsRepository,
};

// Other imports

pub async fn initialize_context(
    app_data_dir: &str,
) -> Result<ServiceContext, Box<dyn std::error::Error>> {
    let db_path = db::init(app_data_dir)?;
    let pool = db::create_pool(&db_path)?;
    let writer = write_actor::spawn_writer(pool.as_ref().clone());

    // Run migrations using the pool directly if run_migrations expects a Pool
    db::run_migrations(&pool)?;

    // Instantiate Repositories
    let settings_repository = Arc::new(SettingsRepository::new(pool.clone(), writer.clone()));
    let account_repository = Arc::new(AccountRepository::new(pool.clone(), writer.clone()));
    let activity_repository = Arc::new(ActivityRepository::new(pool.clone(), writer.clone()));
    let asset_repository = Arc::new(AssetRepository::new(pool.clone(), writer.clone()));
    let goal_repo = Arc::new(GoalRepository::new(pool.clone(), writer.clone()));
    let market_data_repo = Arc::new(MarketDataRepository::new(pool.clone(), writer.clone()));
    let limit_repository = Arc::new(ContributionLimitRepository::new(
        pool.clone(),
        writer.clone(),
    ));
    let fx_repository = Arc::new(FxRepository::new(pool.clone(), writer.clone()));
    let snapshot_repository = Arc::new(SnapshotRepository::new(pool.clone(), writer.clone()));
    let valuation_repository = Arc::new(ValuationRepository::new(pool.clone(), writer.clone()));
    let platform_repository = Arc::new(PlatformRepository::new(pool.clone(), writer.clone()));

    let fx_service = Arc::new(FxService::new(fx_repository.clone()));
    fx_service.initialize()?;

    let settings_service = Arc::new(SettingsService::new(
        settings_repository.clone(),
        fx_service.clone(),
    ));
    let settings = settings_service.get_settings()?;
    let base_currency_string = settings.base_currency.clone();
    let base_currency = Arc::new(RwLock::new(base_currency_string.clone()));
    let instance_id = Arc::new(settings.instance_id.clone());

    let secret_store = shared_secret_store();

    // Quote sync state repository for optimized quote syncing
    let quote_sync_state_repository =
        Arc::new(QuoteSyncStateRepository::new(pool.clone(), writer.clone()));

    // QuoteService provides all quote operations via QuoteServiceTrait
    let quote_service: Arc<dyn QuoteServiceTrait> = Arc::new(
        QuoteService::new(
            market_data_repo.clone(),           // QuoteStore
            quote_sync_state_repository.clone(), // SyncStateStore
            market_data_repo.clone(),           // ProviderSettingsStore
            asset_repository.clone(),           // AssetRepositoryTrait
            secret_store.clone(),
        )
        .await?,
    );

    let asset_service = Arc::new(AssetService::new(
        asset_repository.clone(),
        quote_service.clone(),
    )?);

    let account_service = Arc::new(AccountService::new(
        account_repository.clone(),
        fx_service.clone(),
        base_currency.clone(),
    ));
    let activity_service = Arc::new(ActivityService::new(
        activity_repository.clone(),
        account_service.clone(),
        asset_service.clone(),
        fx_service.clone(),
    ));
    let goal_service = Arc::new(GoalService::new(goal_repo.clone()));
    let limits_service = Arc::new(ContributionLimitService::new(
        fx_service.clone(),
        limit_repository.clone(),
        activity_repository.clone(),
    ));

    let income_service = Arc::new(IncomeService::new(
        fx_service.clone(),
        activity_repository.clone(),
        base_currency.clone(),
    ));

    let snapshot_service = Arc::new(SnapshotService::new(
        base_currency.clone(),
        account_repository.clone(),
        activity_repository.clone(),
        snapshot_repository.clone(),
        asset_repository.clone(),
        fx_service.clone(),
    ));

    let holdings_valuation_service = Arc::new(HoldingsValuationService::new(
        fx_service.clone(),
        quote_service.clone(),
    ));

    let valuation_service = Arc::new(ValuationService::new(
        base_currency.clone(),
        valuation_repository.clone(),
        snapshot_service.clone(),
        quote_service.clone(),
        fx_service.clone(),
    ));

    let performance_service = Arc::new(PerformanceService::new(
        valuation_service.clone(),
        quote_service.clone(),
    ));

    let holdings_service = Arc::new(HoldingsService::new(
        asset_service.clone(),
        snapshot_service.clone(),
        holdings_valuation_service.clone(),
    ));

    let net_worth_service = Arc::new(NetWorthService::new(
        base_currency.clone(),
        account_repository.clone(),
        asset_repository.clone(),
        snapshot_repository.clone(),
        quote_service.clone(),
        valuation_repository.clone(),
        fx_service.clone(),
    ));

    let alternative_asset_repository =
        Arc::new(AlternativeAssetRepository::new(pool.clone(), writer.clone()));

    let sync_service = Arc::new(SyncService::new(
        account_service.clone(),
        platform_repository.clone(),
        pool.clone(),
        writer.clone(),
    ));

    Ok(ServiceContext {
        base_currency,
        instance_id,
        settings_service,
        account_service,
        activity_service,
        asset_service,
        goal_service,
        quote_service,
        limits_service,
        fx_service,
        performance_service,
        income_service,
        snapshot_service,
        holdings_service,
        valuation_service,
        net_worth_service,
        sync_service,
        alternative_asset_repository,
    })
}
