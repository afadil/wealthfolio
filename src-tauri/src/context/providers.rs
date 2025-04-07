use super::registry::ServiceContext;
use std::sync::{Arc, RwLock};
use wealthfolio_core::{
    accounts::{AccountRepository, AccountService},
    activities::{ActivityRepository, ActivityService},
    db::{self},
    fx::{FxRepository, FxService},
    goals::{GoalRepository, GoalService},
    limits::{ContributionLimitRepository, ContributionLimitService},
    market_data::{MarketDataRepository, MarketDataService, MarketDataServiceTrait},
    portfolio::{HistoryRepository, HistoryService, IncomeService, PortfolioService, PerformanceService},
    settings::{settings_repository::SettingsRepository, SettingsService, SettingsServiceTrait},
    {AssetRepository, AssetService},
};

// Other imports

pub async fn initialize_context(
    app_data_dir: &str,
) -> Result<ServiceContext, Box<dyn std::error::Error>> {
    let db_path = db::get_db_path(app_data_dir);
    let pool = db::create_pool(&db_path)?;

    // Run migrations using the pool directly if run_migrations expects a Pool
    db::run_migrations(&pool)?;

    // Instantiate Repositories
    let settings_repository = Arc::new(SettingsRepository::new(pool.clone()));
    let account_repository = Arc::new(AccountRepository::new(pool.clone()));
    let activity_repository = Arc::new(ActivityRepository::new(pool.clone()));
    let asset_repository = Arc::new(AssetRepository::new(pool.clone()));
    let goal_repo = Arc::new(GoalRepository::new(pool.clone()));
    let market_data_repo = Arc::new(MarketDataRepository::new(pool.clone()));
    let limit_repository = Arc::new(ContributionLimitRepository::new(pool.clone()));
    let fx_repository = Arc::new(FxRepository::new(pool.clone()));
    let history_repository = Arc::new(HistoryRepository::new(pool.clone()));

    // Instantiate Transaction Executor using the Arc<DbPool> directly
    let transaction_executor = pool.clone();

    // Instantiate Core Services (like FxService first)
    let fx_service = Arc::new(FxService::new(fx_repository.clone()));

    // Instantiate Settings Service and get base currency
    let settings_service = Arc::new(SettingsService::new(
        settings_repository.clone(),
        fx_service.clone(),
    ));
    let settings = settings_service.get_settings()?; // Call get_settings on the service instance
    let base_currency = Arc::new(RwLock::new(settings.base_currency.clone()));
    let instance_id = Arc::new(settings.instance_id.clone());

    // Instantiate other Services in dependency order
    let market_data_service: Arc<dyn MarketDataServiceTrait> =
        Arc::new(MarketDataService::new(market_data_repo.clone()).await?); // MarketDataService::new is async

    // Correct AssetService instantiation
    let asset_service = Arc::new(AssetService::new(
        asset_repository.clone(), // Pass pool instead of repo
        market_data_service.clone(),
        // Remove fx_service.clone()
    )?); // Handle the Result return type

    let account_service = Arc::new(AccountService::new(
        account_repository.clone(),
        fx_service.clone(),
        transaction_executor.clone(),
        settings.base_currency.clone(),
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

    // Correct IncomeService instantiation
    let income_service = Arc::new(IncomeService::new(
        fx_service.clone(),
        activity_repository.clone(),
        settings.base_currency.clone(),
    ));

    let history_service = Arc::new(HistoryService::new(
        settings.base_currency.clone(),
        fx_service.clone(),
        market_data_service.clone(),
        history_repository.clone(),
    ));

    // Instantiate PerformanceService
    let performance_service = Arc::new(PerformanceService::new(
        history_repository.clone(),
        market_data_service.clone(),
    ));

    let portfolio_service = Arc::new(PortfolioService::new(
        account_service.clone(),
        activity_service.clone(),
        asset_service.clone(),
        market_data_service.clone(),
        income_service.clone(),
        history_service.clone(),
    ));

    Ok(ServiceContext {
        pool: pool.clone(),
        base_currency,
        instance_id,
        settings_service,
        account_service,
        activity_service,
        portfolio_service,
        asset_service,
        goal_service,
        market_data_service,
        limits_service,
        fx_service,
        performance_service,
    })
}
