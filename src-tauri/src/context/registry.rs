use std::sync::{Arc, RwLock};
use wealthfolio_connect::BrokerSyncServiceTrait;
use wealthfolio_core::{
    self, accounts, activities, ai, assets, fx, goals, limits, portfolio, quotes, settings,
    taxonomies,
};
use wealthfolio_storage_sqlite::assets::AlternativeAssetRepository;

use crate::services::ConnectService;

pub struct ServiceContext {
    pub base_currency: Arc<RwLock<String>>,
    pub instance_id: Arc<String>,

    // Services
    pub settings_service: Arc<dyn settings::SettingsServiceTrait>,
    pub activity_service: Arc<dyn activities::ActivityServiceTrait>,
    pub account_service: Arc<dyn accounts::AccountServiceTrait>,
    pub goal_service: Arc<dyn goals::GoalServiceTrait>,
    pub asset_service: Arc<dyn assets::AssetServiceTrait>,
    pub quote_service: Arc<dyn quotes::QuoteServiceTrait>,
    pub limits_service: Arc<dyn limits::ContributionLimitServiceTrait>,
    pub fx_service: Arc<dyn fx::FxServiceTrait>,
    pub performance_service: Arc<dyn portfolio::performance::PerformanceServiceTrait>,
    pub income_service: Arc<dyn portfolio::income::IncomeServiceTrait>,
    pub snapshot_service: Arc<dyn portfolio::snapshot::SnapshotServiceTrait>,
    pub holdings_service: Arc<dyn portfolio::holdings::HoldingsServiceTrait>,
    pub allocation_service: Arc<dyn portfolio::allocation::AllocationServiceTrait>,
    pub valuation_service: Arc<dyn portfolio::valuation::ValuationServiceTrait>,
    pub net_worth_service: Arc<dyn portfolio::net_worth::NetWorthServiceTrait>,
    pub sync_service: Arc<dyn BrokerSyncServiceTrait>,
    pub alternative_asset_repository: Arc<AlternativeAssetRepository>,
    pub taxonomy_service: Arc<dyn taxonomies::TaxonomyServiceTrait>,
    pub connect_service: Arc<ConnectService>,
    pub ai_provider_service: Arc<dyn ai::AiProviderServiceTrait>,
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

    pub fn quote_service(&self) -> Arc<dyn quotes::QuoteServiceTrait> {
        Arc::clone(&self.quote_service)
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

    pub fn allocation_service(&self) -> Arc<dyn portfolio::allocation::AllocationServiceTrait> {
        Arc::clone(&self.allocation_service)
    }

    pub fn valuation_service(&self) -> Arc<dyn portfolio::valuation::ValuationServiceTrait> {
        Arc::clone(&self.valuation_service)
    }

    pub fn sync_service(&self) -> Arc<dyn BrokerSyncServiceTrait> {
        Arc::clone(&self.sync_service)
    }

    pub fn net_worth_service(&self) -> Arc<dyn portfolio::net_worth::NetWorthServiceTrait> {
        Arc::clone(&self.net_worth_service)
    }

    pub fn alternative_asset_repository(&self) -> Arc<AlternativeAssetRepository> {
        Arc::clone(&self.alternative_asset_repository)
    }

    pub fn taxonomy_service(&self) -> Arc<dyn taxonomies::TaxonomyServiceTrait> {
        Arc::clone(&self.taxonomy_service)
    }

    pub fn connect_service(&self) -> Arc<ConnectService> {
        Arc::clone(&self.connect_service)
    }

    pub fn ai_provider_service(&self) -> Arc<dyn ai::AiProviderServiceTrait> {
        Arc::clone(&self.ai_provider_service)
    }
}
