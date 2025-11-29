use std::sync::{Arc, RwLock};
use wealthfolio_core::{
    self, accounts, activities, assets, categories, category_rules, event_types, events, fx, goals,
    limits, market_data, portfolio, settings, spending,
};
pub struct ServiceContext {
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
    pub fx_service: Arc<dyn fx::FxServiceTrait>,
    pub performance_service: Arc<dyn portfolio::performance::PerformanceServiceTrait>,
    pub income_service: Arc<dyn portfolio::income::IncomeServiceTrait>,
    pub spending_service: Arc<dyn spending::SpendingServiceTrait>,
    pub snapshot_service: Arc<dyn portfolio::snapshot::SnapshotServiceTrait>,
    pub holdings_service: Arc<dyn portfolio::holdings::HoldingsServiceTrait>,
    pub valuation_service: Arc<dyn portfolio::valuation::ValuationServiceTrait>,
    pub category_service: Arc<dyn categories::CategoryServiceTrait>,
    pub category_rule_service: Arc<dyn category_rules::CategoryRuleServiceTrait>,
    pub event_type_service: Arc<dyn event_types::EventTypeServiceTrait>,
    pub event_service: Arc<dyn events::EventServiceTrait>,
}

impl ServiceContext {
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

    pub fn spending_service(&self) -> Arc<dyn spending::SpendingServiceTrait> {
        Arc::clone(&self.spending_service)
    }

    pub fn snapshot_service(&self) -> Arc<dyn portfolio::snapshot::SnapshotServiceTrait> {
        Arc::clone(&self.snapshot_service)
    }

    pub fn holdings_service(&self) -> Arc<dyn portfolio::holdings::HoldingsServiceTrait> {
        Arc::clone(&self.holdings_service)
    }

    pub fn valuation_service(&self) -> Arc<dyn portfolio::valuation::ValuationServiceTrait> {
        Arc::clone(&self.valuation_service)
    }

    pub fn category_service(&self) -> Arc<dyn categories::CategoryServiceTrait> {
        Arc::clone(&self.category_service)
    }

    pub fn category_rule_service(&self) -> Arc<dyn category_rules::CategoryRuleServiceTrait> {
        Arc::clone(&self.category_rule_service)
    }

    pub fn event_type_service(&self) -> Arc<dyn event_types::EventTypeServiceTrait> {
        Arc::clone(&self.event_type_service)
    }

    pub fn event_service(&self) -> Arc<dyn events::EventServiceTrait> {
        Arc::clone(&self.event_service)
    }
}
