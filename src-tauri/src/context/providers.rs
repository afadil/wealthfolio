use super::registry::ServiceContext;
use std::sync::{Arc, RwLock};
use wealthfolio_core::{
    accounts::{AccountRepository, AccountService},
    activities::{ActivityRepository, ActivityService},
    db::{self, write_actor},
    fx::{FxRepository, FxService, FxServiceTrait},
    goals::{GoalRepository, GoalService},
    limits::{ContributionLimitRepository, ContributionLimitService},
    market_data::{MarketDataRepository, MarketDataService, MarketDataServiceTrait},
    portfolio::{
        holdings::{HoldingsService, HoldingsValuationService},
        income::IncomeService,
        performance::PerformanceService,
    },
    settings::{settings_repository::SettingsRepository, SettingsService, SettingsServiceTrait},
    snapshot::{SnapshotRepository, SnapshotService},
    valuation::{ValuationRepository, ValuationService},
    AssetRepository, AssetService,
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
    let limit_repository = Arc::new(ContributionLimitRepository::new(pool.clone(), writer.clone()));
    let fx_repository = Arc::new(FxRepository::new(pool.clone(), writer.clone()));
    let snapshot_repository = Arc::new(SnapshotRepository::new(pool.clone(), writer.clone()));
    let valuation_repository = Arc::new(ValuationRepository::new(pool.clone(), writer.clone()));
    // Instantiate Transaction Executor using the Arc<DbPool> directly
    let transaction_executor = pool.clone();

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

    let market_data_service: Arc<dyn MarketDataServiceTrait> =
        Arc::new(MarketDataService::new(market_data_repo.clone(), asset_repository.clone()).await?);

    let asset_service = Arc::new(AssetService::new(
        asset_repository.clone(),
        market_data_service.clone(),
    )?);

    let account_service = Arc::new(AccountService::new(
        account_repository.clone(),
        fx_service.clone(),
        transaction_executor.clone(),
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
        market_data_service.clone(),
    ));

    let valuation_service = Arc::new(ValuationService::new(
        base_currency.clone(),
        valuation_repository.clone(),
        snapshot_service.clone(),
        market_data_service.clone(),
        fx_service.clone(),
    ));

    let performance_service = Arc::new(PerformanceService::new(
        valuation_service.clone(),
        market_data_service.clone(),
    ));

    let holdings_service = Arc::new(HoldingsService::new(
        asset_service.clone(),
        snapshot_service.clone(),
        holdings_valuation_service.clone(),
    ));

    Ok(ServiceContext {
        base_currency,
        instance_id,
        settings_service,
        account_service,
        activity_service,
        asset_service,
        goal_service,
        market_data_service,
        limits_service,
        fx_service,
        performance_service,
        income_service,
        snapshot_service,
        holdings_service,
        valuation_service,
    })
}
