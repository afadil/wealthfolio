//! Tauri-side implementation of AiEnvironment.
//!
//! Provides the wealthfolio-ai crate with access to Tauri services
//! for tool execution and settings management.

use std::sync::{Arc, RwLock};

use wealthfolio_ai::{AiEnvironment, ChatRepositoryTrait};
use wealthfolio_core::{
    accounts::AccountServiceTrait, activities::ActivityServiceTrait,
    allocation::AllocationServiceTrait, goals::GoalServiceTrait, holdings::HoldingsServiceTrait,
    performance::PerformanceServiceTrait, quotes::QuoteServiceTrait, secrets::SecretStore,
    settings::SettingsServiceTrait, valuation::ValuationServiceTrait,
};

/// Tauri-side implementation of AiEnvironment.
///
/// Wraps existing services from ServiceContext to provide access
/// to the AI crate for tool execution.
pub struct TauriAiEnvironment {
    base_currency: Arc<RwLock<String>>,
    account_service: Arc<dyn AccountServiceTrait + Send + Sync>,
    activity_service: Arc<dyn ActivityServiceTrait + Send + Sync>,
    holdings_service: Arc<dyn HoldingsServiceTrait + Send + Sync>,
    valuation_service: Arc<dyn ValuationServiceTrait + Send + Sync>,
    goal_service: Arc<dyn GoalServiceTrait + Send + Sync>,
    settings_service: Arc<dyn SettingsServiceTrait + Send + Sync>,
    secret_store: Arc<dyn SecretStore>,
    chat_repository: Arc<dyn ChatRepositoryTrait + Send + Sync>,
    quote_service: Arc<dyn QuoteServiceTrait + Send + Sync>,
    allocation_service: Arc<dyn AllocationServiceTrait + Send + Sync>,
    performance_service: Arc<dyn PerformanceServiceTrait + Send + Sync>,
}

impl TauriAiEnvironment {
    /// Create a new Tauri AI environment.
    pub fn new(
        base_currency: Arc<RwLock<String>>,
        account_service: Arc<dyn AccountServiceTrait + Send + Sync>,
        activity_service: Arc<dyn ActivityServiceTrait + Send + Sync>,
        holdings_service: Arc<dyn HoldingsServiceTrait + Send + Sync>,
        valuation_service: Arc<dyn ValuationServiceTrait + Send + Sync>,
        goal_service: Arc<dyn GoalServiceTrait + Send + Sync>,
        settings_service: Arc<dyn SettingsServiceTrait + Send + Sync>,
        secret_store: Arc<dyn SecretStore>,
        chat_repository: Arc<dyn ChatRepositoryTrait + Send + Sync>,
        quote_service: Arc<dyn QuoteServiceTrait + Send + Sync>,
        allocation_service: Arc<dyn AllocationServiceTrait + Send + Sync>,
        performance_service: Arc<dyn PerformanceServiceTrait + Send + Sync>,
    ) -> Self {
        Self {
            base_currency,
            account_service,
            activity_service,
            holdings_service,
            valuation_service,
            goal_service,
            settings_service,
            secret_store,
            chat_repository,
            quote_service,
            allocation_service,
            performance_service,
        }
    }
}

impl AiEnvironment for TauriAiEnvironment {
    fn base_currency(&self) -> String {
        self.base_currency.read().unwrap().clone()
    }

    fn account_service(&self) -> Arc<dyn AccountServiceTrait> {
        self.account_service.clone()
    }

    fn activity_service(&self) -> Arc<dyn ActivityServiceTrait> {
        self.activity_service.clone()
    }

    fn holdings_service(&self) -> Arc<dyn HoldingsServiceTrait> {
        self.holdings_service.clone()
    }

    fn valuation_service(&self) -> Arc<dyn ValuationServiceTrait> {
        self.valuation_service.clone()
    }

    fn goal_service(&self) -> Arc<dyn GoalServiceTrait> {
        self.goal_service.clone()
    }

    fn settings_service(&self) -> Arc<dyn SettingsServiceTrait> {
        self.settings_service.clone()
    }

    fn secret_store(&self) -> Arc<dyn SecretStore> {
        self.secret_store.clone()
    }

    fn chat_repository(&self) -> Arc<dyn ChatRepositoryTrait> {
        self.chat_repository.clone()
    }

    fn quote_service(&self) -> Arc<dyn QuoteServiceTrait> {
        self.quote_service.clone()
    }

    fn allocation_service(&self) -> Arc<dyn AllocationServiceTrait> {
        self.allocation_service.clone()
    }

    fn performance_service(&self) -> Arc<dyn PerformanceServiceTrait> {
        self.performance_service.clone()
    }
}
