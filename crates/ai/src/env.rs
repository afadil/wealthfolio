//! Environment abstraction for AI assistant.
//!
//! This module provides the `AiEnvironment` trait that abstracts runtime
//! dependencies like secret stores, services, and configuration. The Tauri
//! and Axum backends implement this trait with their specific service instances.

use async_trait::async_trait;
use std::sync::Arc;
use wealthfolio_core::{
    accounts::AccountServiceTrait,
    activities::ActivityServiceTrait,
    goals::GoalServiceTrait,
    portfolio::{holdings::HoldingsServiceTrait, valuation::ValuationServiceTrait},
    quotes::QuoteServiceTrait,
    secrets::SecretStore,
    settings::SettingsServiceTrait,
};

use crate::types::ChatRepositoryTrait;

/// Environment abstraction for the AI assistant.
///
/// Implementations provide access to:
/// - Service traits for portfolio data access
/// - Secret store for API keys
/// - Configuration (base currency, etc.)
/// - Chat repository for thread/message persistence
/// - Quote service for symbol search
#[async_trait]
pub trait AiEnvironment: Send + Sync {
    /// Get the user's base currency (e.g., "USD", "EUR").
    fn base_currency(&self) -> String;

    /// Get the account service for fetching accounts.
    fn account_service(&self) -> Arc<dyn AccountServiceTrait>;

    /// Get the activity service for fetching/saving activities.
    fn activity_service(&self) -> Arc<dyn ActivityServiceTrait>;

    /// Get the holdings service for fetching holdings.
    fn holdings_service(&self) -> Arc<dyn HoldingsServiceTrait>;

    /// Get the valuation service for fetching valuations.
    fn valuation_service(&self) -> Arc<dyn ValuationServiceTrait>;

    /// Get the goal service for fetching goals.
    fn goal_service(&self) -> Arc<dyn GoalServiceTrait>;

    /// Get the settings service for storing AI settings.
    fn settings_service(&self) -> Arc<dyn SettingsServiceTrait>;

    /// Get the secret store for API keys.
    fn secret_store(&self) -> Arc<dyn SecretStore>;

    /// Get the chat repository for thread/message persistence.
    fn chat_repository(&self) -> Arc<dyn ChatRepositoryTrait>;

    /// Get the quote service for symbol search.
    fn quote_service(&self) -> Arc<dyn QuoteServiceTrait>;
}

#[cfg(test)]
pub mod test_env {
    use super::*;
    use chrono::{DateTime, NaiveDate, Utc};
    use std::collections::{HashMap, HashSet};
    use std::sync::RwLock;
    use wealthfolio_core::{
        accounts::{Account, AccountServiceTrait, AccountUpdate, NewAccount},
        activities::{
            Activity, ActivityBulkMutationRequest, ActivityBulkMutationResult,
            ActivityDetails, ActivityImport, ActivitySearchResponse, ActivitySearchResponseMeta,
            ActivityServiceTrait, ActivityUpdate, ImportMappingData, NewActivity, Sort,
        },
        assets::{Asset, ProviderProfile},
        errors::DatabaseError,
        goals::{Goal, GoalServiceTrait, GoalsAllocation, NewGoal},
        holdings::{Holding, HoldingsServiceTrait},
        quotes::{
            LatestQuotePair, Quote, QuoteServiceTrait, SymbolSearchResult, QuoteSyncState, SyncMode,
            SyncResult, SymbolSyncPlan, ProviderInfo, QuoteImport,
        },
        secrets::SecretStore,
        settings::{Settings, SettingsServiceTrait, SettingsUpdate},
        valuation::{DailyAccountValuation, ValuationServiceTrait},
        Error as CoreError, Result as CoreResult,
    };

    /// Mock secret store for testing.
    #[derive(Default)]
    pub struct MockSecretStore {
        secrets: RwLock<HashMap<String, String>>,
    }

    impl SecretStore for MockSecretStore {
        fn get_secret(&self, key: &str) -> CoreResult<Option<String>> {
            Ok(self.secrets.read().unwrap().get(key).cloned())
        }

        fn set_secret(&self, key: &str, value: &str) -> CoreResult<()> {
            self.secrets
                .write()
                .unwrap()
                .insert(key.to_string(), value.to_string());
            Ok(())
        }

        fn delete_secret(&self, key: &str) -> CoreResult<()> {
            self.secrets.write().unwrap().remove(key);
            Ok(())
        }
    }

    /// Mock account service for testing.
    #[derive(Default)]
    pub struct MockAccountService {
        pub accounts: Vec<Account>,
    }

    #[async_trait]
    impl AccountServiceTrait for MockAccountService {
        fn get_all_accounts(&self) -> CoreResult<Vec<Account>> {
            Ok(self.accounts.clone())
        }

        fn get_active_accounts(&self) -> CoreResult<Vec<Account>> {
            Ok(self
                .accounts
                .iter()
                .filter(|a| a.is_active)
                .cloned()
                .collect())
        }

        fn get_account(&self, id: &str) -> CoreResult<Account> {
            self.accounts
                .iter()
                .find(|a| a.id == id)
                .cloned()
                .ok_or_else(|| CoreError::Database(DatabaseError::NotFound(format!("Account {}", id))))
        }

        fn list_accounts(
            &self,
            is_active_filter: Option<bool>,
            _account_ids: Option<&[String]>,
        ) -> CoreResult<Vec<Account>> {
            let accounts = match is_active_filter {
                Some(true) => self.accounts.iter().filter(|a| a.is_active).cloned().collect(),
                Some(false) => self.accounts.iter().filter(|a| !a.is_active).cloned().collect(),
                None => self.accounts.clone(),
            };
            Ok(accounts)
        }

        fn get_accounts_by_ids(&self, account_ids: &[String]) -> CoreResult<Vec<Account>> {
            Ok(self
                .accounts
                .iter()
                .filter(|a| account_ids.contains(&a.id))
                .cloned()
                .collect())
        }

        async fn create_account(&self, _account: NewAccount) -> CoreResult<Account> {
            unimplemented!("MockAccountService::create_account")
        }

        async fn update_account(&self, _account: AccountUpdate) -> CoreResult<Account> {
            unimplemented!("MockAccountService::update_account")
        }

        async fn delete_account(&self, _id: &str) -> CoreResult<()> {
            unimplemented!("MockAccountService::delete_account")
        }
    }

    /// Mock activity service for testing.
    #[derive(Default)]
    pub struct MockActivityService {
        pub activities: Vec<ActivityDetails>,
    }

    #[async_trait]
    impl ActivityServiceTrait for MockActivityService {
        fn get_activity(&self, _activity_id: &str) -> CoreResult<Activity> {
            unimplemented!("MockActivityService::get_activity")
        }

        fn get_activities(&self) -> CoreResult<Vec<Activity>> {
            unimplemented!("MockActivityService::get_activities")
        }

        fn get_activities_by_account_id(&self, _account_id: &str) -> CoreResult<Vec<Activity>> {
            unimplemented!("MockActivityService::get_activities_by_account_id")
        }

        fn get_activities_by_account_ids(&self, _account_ids: &[String]) -> CoreResult<Vec<Activity>> {
            unimplemented!("MockActivityService::get_activities_by_account_ids")
        }

        fn get_trading_activities(&self) -> CoreResult<Vec<Activity>> {
            unimplemented!("MockActivityService::get_trading_activities")
        }

        fn get_income_activities(&self) -> CoreResult<Vec<Activity>> {
            unimplemented!("MockActivityService::get_income_activities")
        }

        fn search_activities(
            &self,
            _page: i64,
            _page_size: i64,
            _account_id_filter: Option<Vec<String>>,
            _activity_type_filter: Option<Vec<String>>,
            _asset_id_keyword: Option<String>,
            _sort: Option<Sort>,
            _needs_review_filter: Option<bool>,
        ) -> CoreResult<ActivitySearchResponse> {
            Ok(ActivitySearchResponse {
                data: self.activities.clone(),
                meta: ActivitySearchResponseMeta {
                    total_row_count: self.activities.len() as i64,
                },
            })
        }

        fn get_first_activity_date(
            &self,
            _account_ids: Option<&[String]>,
        ) -> CoreResult<Option<DateTime<Utc>>> {
            Ok(None)
        }

        fn get_import_mapping(&self, _account_id: String) -> CoreResult<ImportMappingData> {
            // Return error to simulate no saved mapping (tests will use auto-detection)
            Err(wealthfolio_core::errors::DatabaseError::NotFound(
                "No saved import mapping".to_string(),
            ).into())
        }

        async fn create_activity(&self, _activity: NewActivity) -> CoreResult<Activity> {
            unimplemented!("MockActivityService::create_activity")
        }

        async fn update_activity(&self, _activity: ActivityUpdate) -> CoreResult<Activity> {
            unimplemented!("MockActivityService::update_activity")
        }

        async fn delete_activity(&self, _activity_id: String) -> CoreResult<Activity> {
            unimplemented!("MockActivityService::delete_activity")
        }

        async fn bulk_mutate_activities(
            &self,
            _request: ActivityBulkMutationRequest,
        ) -> CoreResult<ActivityBulkMutationResult> {
            unimplemented!("MockActivityService::bulk_mutate_activities")
        }

        async fn check_activities_import(
            &self,
            _account_id: String,
            _activities: Vec<ActivityImport>,
            _dry_run: bool,
        ) -> CoreResult<Vec<ActivityImport>> {
            unimplemented!("MockActivityService::check_activities_import")
        }

        async fn import_activities(
            &self,
            _account_id: String,
            _activities: Vec<ActivityImport>,
        ) -> CoreResult<wealthfolio_core::activities::ImportActivitiesResult> {
            unimplemented!("MockActivityService::import_activities")
        }

        async fn save_import_mapping(
            &self,
            _mapping_data: ImportMappingData,
        ) -> CoreResult<ImportMappingData> {
            unimplemented!("MockActivityService::save_import_mapping")
        }

        fn check_existing_duplicates(
            &self,
            _idempotency_keys: Vec<String>,
        ) -> CoreResult<std::collections::HashMap<String, String>> {
            Ok(std::collections::HashMap::new())
        }

        fn parse_csv(
            &self,
            content: &[u8],
            config: &wealthfolio_core::activities::ParseConfig,
        ) -> CoreResult<wealthfolio_core::activities::ParsedCsvResult> {
            // Delegate to the actual core parser for testing
            wealthfolio_core::activities::parse_csv(content, config)
        }
    }

    /// Mock holdings service for testing.
    #[derive(Default)]
    pub struct MockHoldingsService {
        pub holdings: Vec<Holding>,
    }

    #[async_trait]
    impl HoldingsServiceTrait for MockHoldingsService {
        async fn get_holdings(
            &self,
            _account_id: &str,
            _base_currency: &str,
        ) -> CoreResult<Vec<Holding>> {
            Ok(self.holdings.clone())
        }

        async fn get_holding(
            &self,
            _account_id: &str,
            _asset_id: &str,
            _base_currency: &str,
        ) -> CoreResult<Option<Holding>> {
            Ok(None)
        }
    }

    /// Mock valuation service for testing.
    #[derive(Default)]
    pub struct MockValuationService {
        pub valuations: Vec<DailyAccountValuation>,
    }

    #[async_trait]
    impl ValuationServiceTrait for MockValuationService {
        fn get_latest_valuations(
            &self,
            _account_ids: &[String],
        ) -> CoreResult<Vec<DailyAccountValuation>> {
            Ok(self.valuations.clone())
        }

        fn get_historical_valuations(
            &self,
            _account_id: &str,
            _start_date: Option<NaiveDate>,
            _end_date: Option<NaiveDate>,
        ) -> CoreResult<Vec<DailyAccountValuation>> {
            Ok(self.valuations.clone())
        }

        fn get_valuations_on_date(
            &self,
            _account_ids: &[String],
            _date: NaiveDate,
        ) -> CoreResult<Vec<DailyAccountValuation>> {
            Ok(self.valuations.clone())
        }

        async fn calculate_valuation_history(
            &self,
            _account_id: &str,
            _force_full_recalc: bool,
        ) -> CoreResult<()> {
            Ok(())
        }
    }

    /// Mock goal service for testing.
    #[derive(Default)]
    pub struct MockGoalService {
        pub goals: Vec<Goal>,
        pub allocations: Vec<GoalsAllocation>,
    }

    #[async_trait]
    impl GoalServiceTrait for MockGoalService {
        fn get_goals(&self) -> CoreResult<Vec<Goal>> {
            Ok(self.goals.clone())
        }

        fn load_goals_allocations(&self) -> CoreResult<Vec<GoalsAllocation>> {
            Ok(self.allocations.clone())
        }

        async fn create_goal(&self, _goal: NewGoal) -> CoreResult<Goal> {
            unimplemented!("MockGoalService::create_goal")
        }

        async fn update_goal(&self, _goal: Goal) -> CoreResult<Goal> {
            unimplemented!("MockGoalService::update_goal")
        }

        async fn delete_goal(&self, _goal_id: String) -> CoreResult<usize> {
            unimplemented!("MockGoalService::delete_goal")
        }

        async fn upsert_goal_allocations(
            &self,
            _allocations: Vec<GoalsAllocation>,
        ) -> CoreResult<usize> {
            unimplemented!("MockGoalService::upsert_goal_allocations")
        }
    }

    /// Mock settings service for testing.
    #[derive(Default)]
    pub struct MockSettingsService {
        pub settings: RwLock<HashMap<String, String>>,
    }

    #[async_trait]
    impl SettingsServiceTrait for MockSettingsService {
        fn get_settings(&self) -> CoreResult<Settings> {
            Ok(Settings::default())
        }

        async fn update_settings(&self, _new_settings: &SettingsUpdate) -> CoreResult<()> {
            Ok(())
        }

        fn get_base_currency(&self) -> CoreResult<Option<String>> {
            Ok(Some("USD".to_string()))
        }

        async fn update_base_currency(&self, _new_base_currency: &str) -> CoreResult<()> {
            Ok(())
        }

        fn is_auto_update_check_enabled(&self) -> CoreResult<bool> {
            Ok(true)
        }

        fn is_sync_enabled(&self) -> CoreResult<bool> {
            Ok(false)
        }

        fn get_setting_value(&self, key: &str) -> CoreResult<Option<String>> {
            Ok(self.settings.read().unwrap().get(key).cloned())
        }

        async fn set_setting_value(&self, key: &str, value: &str) -> CoreResult<()> {
            self.settings
                .write()
                .unwrap()
                .insert(key.to_string(), value.to_string());
            Ok(())
        }
    }

    /// Mock chat repository for testing.
    #[derive(Default)]
    pub struct MockChatRepository {
        pub threads: RwLock<HashMap<String, crate::types::ChatThread>>,
        pub messages: RwLock<HashMap<String, Vec<crate::types::ChatMessage>>>,
    }

    #[async_trait]
    impl crate::types::ChatRepositoryTrait for MockChatRepository {
        async fn create_thread(
            &self,
            thread: crate::types::ChatThread,
        ) -> crate::types::ChatRepositoryResult<crate::types::ChatThread> {
            self.threads
                .write()
                .unwrap()
                .insert(thread.id.clone(), thread.clone());
            Ok(thread)
        }

        fn get_thread(
            &self,
            thread_id: &str,
        ) -> crate::types::ChatRepositoryResult<Option<crate::types::ChatThread>> {
            Ok(self.threads.read().unwrap().get(thread_id).cloned())
        }

        fn list_threads(
            &self,
            limit: i64,
            _offset: i64,
        ) -> crate::types::ChatRepositoryResult<Vec<crate::types::ChatThread>> {
            let threads = self.threads.read().unwrap();
            let mut list: Vec<_> = threads.values().cloned().collect();
            list.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
            list.truncate(limit as usize);
            Ok(list)
        }

        fn list_threads_paginated(
            &self,
            request: &crate::types::ListThreadsRequest,
        ) -> crate::types::ChatRepositoryResult<crate::types::ThreadPage> {
            let threads = self.threads.read().unwrap();
            let mut list: Vec<_> = threads.values().cloned().collect();
            list.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));

            // Apply search filter if provided
            if let Some(ref search) = request.search {
                let search_lower = search.to_lowercase();
                list.retain(|t| {
                    t.title
                        .as_ref()
                        .map(|title| title.to_lowercase().contains(&search_lower))
                        .unwrap_or(false)
                });
            }

            let limit = request.limit.unwrap_or(20).min(100) as usize;
            let has_more = list.len() > limit;
            list.truncate(limit);

            let next_cursor = if has_more {
                list.last().map(|t| t.id.clone())
            } else {
                None
            };

            Ok(crate::types::ThreadPage {
                threads: list,
                next_cursor,
                has_more,
            })
        }

        async fn update_thread(
            &self,
            thread: crate::types::ChatThread,
        ) -> crate::types::ChatRepositoryResult<crate::types::ChatThread> {
            self.threads
                .write()
                .unwrap()
                .insert(thread.id.clone(), thread.clone());
            Ok(thread)
        }

        async fn delete_thread(&self, thread_id: &str) -> crate::types::ChatRepositoryResult<()> {
            self.threads.write().unwrap().remove(thread_id);
            self.messages.write().unwrap().remove(thread_id);
            Ok(())
        }

        async fn create_message(
            &self,
            message: crate::types::ChatMessage,
        ) -> crate::types::ChatRepositoryResult<crate::types::ChatMessage> {
            self.messages
                .write()
                .unwrap()
                .entry(message.thread_id.clone())
                .or_default()
                .push(message.clone());
            Ok(message)
        }

        fn get_message(
            &self,
            message_id: &str,
        ) -> crate::types::ChatRepositoryResult<Option<crate::types::ChatMessage>> {
            let messages = self.messages.read().unwrap();
            for msgs in messages.values() {
                if let Some(msg) = msgs.iter().find(|m| m.id == message_id) {
                    return Ok(Some(msg.clone()));
                }
            }
            Ok(None)
        }

        fn get_messages_by_thread(
            &self,
            thread_id: &str,
        ) -> crate::types::ChatRepositoryResult<Vec<crate::types::ChatMessage>> {
            Ok(self
                .messages
                .read()
                .unwrap()
                .get(thread_id)
                .cloned()
                .unwrap_or_default())
        }

        async fn update_message(
            &self,
            message: crate::types::ChatMessage,
        ) -> crate::types::ChatRepositoryResult<crate::types::ChatMessage> {
            let mut messages = self.messages.write().unwrap();
            if let Some(msgs) = messages.get_mut(&message.thread_id) {
                if let Some(pos) = msgs.iter().position(|m| m.id == message.id) {
                    msgs[pos] = message.clone();
                }
            }
            Ok(message)
        }

        async fn add_tag(&self, _thread_id: &str, _tag: &str) -> crate::types::ChatRepositoryResult<()> {
            Ok(())
        }

        async fn remove_tag(&self, _thread_id: &str, _tag: &str) -> crate::types::ChatRepositoryResult<()> {
            Ok(())
        }

        fn get_tags(&self, _thread_id: &str) -> crate::types::ChatRepositoryResult<Vec<String>> {
            Ok(Vec::new())
        }
    }

    /// Mock quote service for testing.
    #[derive(Default)]
    pub struct MockQuoteService {
        pub search_results: RwLock<Vec<SymbolSearchResult>>,
    }

    #[async_trait]
    impl QuoteServiceTrait for MockQuoteService {
        fn get_latest_quote(&self, _symbol: &str) -> CoreResult<Quote> {
            unimplemented!("MockQuoteService::get_latest_quote")
        }

        fn get_latest_quotes(&self, _symbols: &[String]) -> CoreResult<HashMap<String, Quote>> {
            Ok(HashMap::new())
        }

        fn get_latest_quotes_pair(
            &self,
            _symbols: &[String],
        ) -> CoreResult<HashMap<String, LatestQuotePair>> {
            Ok(HashMap::new())
        }

        fn get_historical_quotes(&self, _symbol: &str) -> CoreResult<Vec<Quote>> {
            Ok(Vec::new())
        }

        fn get_all_historical_quotes(&self) -> CoreResult<HashMap<String, Vec<(NaiveDate, Quote)>>> {
            Ok(HashMap::new())
        }

        fn get_quotes_in_range(
            &self,
            _symbols: &HashSet<String>,
            _start: NaiveDate,
            _end: NaiveDate,
        ) -> CoreResult<Vec<Quote>> {
            Ok(Vec::new())
        }

        fn get_quotes_in_range_filled(
            &self,
            _symbols: &HashSet<String>,
            _start: NaiveDate,
            _end: NaiveDate,
            _first_appearance: &HashMap<String, NaiveDate>,
        ) -> CoreResult<Vec<Quote>> {
            Ok(Vec::new())
        }

        async fn get_daily_quotes(
            &self,
            _asset_ids: &HashSet<String>,
            _start: NaiveDate,
            _end: NaiveDate,
        ) -> CoreResult<HashMap<NaiveDate, HashMap<String, Quote>>> {
            Ok(HashMap::new())
        }

        async fn add_quote(&self, quote: &Quote) -> CoreResult<Quote> {
            Ok(quote.clone())
        }

        async fn update_quote(&self, quote: Quote) -> CoreResult<Quote> {
            Ok(quote)
        }

        async fn delete_quote(&self, _quote_id: &str) -> CoreResult<()> {
            Ok(())
        }

        async fn bulk_upsert_quotes(&self, quotes: Vec<Quote>) -> CoreResult<usize> {
            Ok(quotes.len())
        }

        async fn search_symbol(&self, query: &str) -> CoreResult<Vec<SymbolSearchResult>> {
            self.search_symbol_with_currency(query, None).await
        }

        async fn search_symbol_with_currency(
            &self,
            _query: &str,
            _account_currency: Option<&str>,
        ) -> CoreResult<Vec<SymbolSearchResult>> {
            Ok(self.search_results.read().unwrap().clone())
        }

        async fn get_asset_profile(&self, _asset: &Asset) -> CoreResult<ProviderProfile> {
            unimplemented!("MockQuoteService::get_asset_profile")
        }

        async fn fetch_quotes_from_provider(
            &self,
            _asset_id: &str,
            _start: NaiveDate,
            _end: NaiveDate,
        ) -> CoreResult<Vec<Quote>> {
            Ok(Vec::new())
        }

        async fn fetch_quotes_for_symbol(
            &self,
            _symbol: &str,
            _currency: &str,
            _start: NaiveDate,
            _end: NaiveDate,
        ) -> CoreResult<Vec<Quote>> {
            Ok(Vec::new())
        }

        async fn sync(&self, _mode: SyncMode, _asset_ids: Option<Vec<String>>) -> CoreResult<SyncResult> {
            Ok(SyncResult::default())
        }

        async fn resync(&self, _symbols: Option<Vec<String>>) -> CoreResult<SyncResult> {
            Ok(SyncResult::default())
        }

        async fn refresh_sync_state(&self) -> CoreResult<()> {
            Ok(())
        }

        fn get_sync_plan(&self) -> CoreResult<Vec<SymbolSyncPlan>> {
            Ok(Vec::new())
        }

        async fn handle_activity_created(
            &self,
            _symbol: &str,
            _activity_date: NaiveDate,
        ) -> CoreResult<()> {
            Ok(())
        }

        async fn handle_activity_deleted(&self, _symbol: &str) -> CoreResult<()> {
            Ok(())
        }

        async fn delete_sync_state(&self, _symbol: &str) -> CoreResult<()> {
            Ok(())
        }

        fn get_symbols_needing_sync(&self) -> CoreResult<Vec<QuoteSyncState>> {
            Ok(Vec::new())
        }

        fn get_sync_state(&self, _symbol: &str) -> CoreResult<Option<QuoteSyncState>> {
            Ok(None)
        }

        async fn mark_profile_enriched(&self, _symbol: &str) -> CoreResult<()> {
            Ok(())
        }

        fn get_assets_needing_profile_enrichment(&self) -> CoreResult<Vec<QuoteSyncState>> {
            Ok(Vec::new())
        }

        async fn update_position_status_from_holdings(
            &self,
            _current_holdings: &std::collections::HashMap<String, rust_decimal::Decimal>,
        ) -> CoreResult<()> {
            Ok(())
        }

        fn get_sync_states_with_errors(&self) -> CoreResult<Vec<QuoteSyncState>> {
            Ok(Vec::new())
        }

        async fn get_providers_info(&self) -> CoreResult<Vec<ProviderInfo>> {
            Ok(Vec::new())
        }

        async fn update_provider_settings(
            &self,
            _provider_id: &str,
            _priority: i32,
            _enabled: bool,
        ) -> CoreResult<()> {
            Ok(())
        }

        async fn import_quotes(
            &self,
            quotes: Vec<QuoteImport>,
            _overwrite: bool,
        ) -> CoreResult<Vec<QuoteImport>> {
            Ok(quotes)
        }
    }

    /// Mock environment for testing.
    pub struct MockEnvironment {
        pub base_currency: String,
        pub account_service: Arc<dyn AccountServiceTrait>,
        pub activity_service: Arc<dyn ActivityServiceTrait>,
        pub holdings_service: Arc<dyn HoldingsServiceTrait>,
        pub valuation_service: Arc<dyn ValuationServiceTrait>,
        pub goal_service: Arc<dyn GoalServiceTrait>,
        pub settings_service: Arc<dyn SettingsServiceTrait>,
        pub secret_store: Arc<dyn SecretStore>,
        pub chat_repository: Arc<dyn ChatRepositoryTrait>,
        pub quote_service: Arc<dyn QuoteServiceTrait>,
    }

    impl Default for MockEnvironment {
        fn default() -> Self {
            Self::new()
        }
    }

    impl MockEnvironment {
        pub fn new() -> Self {
            Self {
                base_currency: "USD".to_string(),
                account_service: Arc::new(MockAccountService::default()),
                activity_service: Arc::new(MockActivityService::default()),
                holdings_service: Arc::new(MockHoldingsService::default()),
                valuation_service: Arc::new(MockValuationService::default()),
                goal_service: Arc::new(MockGoalService::default()),
                settings_service: Arc::new(MockSettingsService::default()),
                secret_store: Arc::new(MockSecretStore::default()),
                chat_repository: Arc::new(MockChatRepository::default()),
                quote_service: Arc::new(MockQuoteService::default()),
            }
        }

        pub fn with_secret(self, key: &str, value: &str) -> Self {
            self.secret_store.set_secret(key, value).unwrap();
            self
        }
    }

    #[async_trait]
    impl AiEnvironment for MockEnvironment {
        fn base_currency(&self) -> String {
            self.base_currency.clone()
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
    }
}
