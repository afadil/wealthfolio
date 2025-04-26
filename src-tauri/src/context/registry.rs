// context/registry.rs
use diesel::r2d2;
use diesel::r2d2::ConnectionManager;
use diesel::SqliteConnection;
use std::sync::{Arc, RwLock};
use wealthfolio_core::{
    self, accounts, activities, assets, fx, goals, limits, market_data, portfolio, settings
};
type DbPool = r2d2::Pool<ConnectionManager<SqliteConnection>>;

pub struct ServiceContext {
    // Database connection
    pub pool: Arc<DbPool>,
    pub base_currency: Arc<RwLock<String>>,
    pub instance_id: Arc<String>,

    // Services
    pub settings_service: Arc<dyn settings::SettingsServiceTrait>,
    pub activity_service: Arc<dyn activities::ActivityServiceTrait>,
    pub account_service: Arc<dyn accounts::AccountServiceTrait>,
    pub goal_service: Arc<dyn goals::GoalServiceTrait>,
    pub asset_service: Arc<dyn assets::AssetServiceTrait>,
    pub market_data_service: Arc<dyn market_data::MarketDataServiceTrait>,
    pub limits_service: Arc<dyn limits::ContributionLimitServiceTrait>,
    pub fx_service:Arc<dyn fx::FxServiceTrait>,
    pub performance_service: Arc<dyn portfolio::performance::PerformanceServiceTrait>,
    pub income_service: Arc<dyn portfolio::income::IncomeServiceTrait>,
    pub snapshot_service: Arc<dyn portfolio::snapshot::SnapshotServiceTrait>,
    pub holdings_service: Arc<dyn portfolio::holdings::HoldingsServiceTrait>,
    pub holdings_valuation_service: Arc<dyn portfolio::holdings::HoldingsValuationServiceTrait>,
    pub valuation_service: Arc<dyn portfolio::valuation::ValuationServiceTrait>,
}

impl ServiceContext {
    // Accessor methods
    pub fn pool(&self) -> &Arc<DbPool> {
        &self.pool
    }

    pub fn get_base_currency(&self) -> String {
        self.base_currency.read().unwrap().clone()
    }

    pub fn update_base_currency(&self, new_currency: String) {
        *self.base_currency.write().unwrap() = new_currency;
    }

    pub fn settings_service(&self) -> Arc<dyn settings::SettingsServiceTrait> {
        Arc::clone(&self.settings_service)
    }

    pub fn account_service(&self) -> Arc<dyn accounts::AccountServiceTrait> {
        Arc::clone(&self.account_service)
    }

    pub fn activity_service(&self) -> Arc<dyn activities::ActivityServiceTrait> {
        Arc::clone(&self.activity_service)
    }

    pub fn asset_service(&self) -> Arc<dyn assets::AssetServiceTrait> {
        Arc::clone(&self.asset_service)
    }

    pub fn goal_service(&self) -> Arc<dyn goals::GoalServiceTrait> {
        Arc::clone(&self.goal_service)
    }

    pub fn market_data_service(&self) -> Arc<dyn market_data::MarketDataServiceTrait> {
        Arc::clone(&self.market_data_service)
    }

    pub fn limits_service(&self) -> Arc<dyn limits::ContributionLimitServiceTrait> {
        Arc::clone(&self.limits_service)
    }

    pub fn fx_service(&self) -> Arc<dyn fx::FxServiceTrait> {
        Arc::clone(&self.fx_service)
    }

    pub fn performance_service(&self) -> Arc<dyn portfolio::performance::PerformanceServiceTrait> {
        Arc::clone(&self.performance_service)
    }

    pub fn income_service(&self) -> Arc<dyn portfolio::income::IncomeServiceTrait> {
        Arc::clone(&self.income_service)
    }

    pub fn snapshot_service(&self) -> Arc<dyn portfolio::snapshot::SnapshotServiceTrait> {
        Arc::clone(&self.snapshot_service)
    }

    pub fn holdings_service(&self) -> Arc<dyn portfolio::holdings::HoldingsServiceTrait> {
        Arc::clone(&self.holdings_service)
    }

    pub fn holdings_valuation_service(&self) -> Arc<dyn portfolio::holdings::HoldingsValuationServiceTrait> {
        Arc::clone(&self.holdings_valuation_service)
    }

    pub fn valuation_service(&self) -> Arc<dyn portfolio::valuation::ValuationServiceTrait> {
        Arc::clone(&self.valuation_service)
    }
}
