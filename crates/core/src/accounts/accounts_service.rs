//! Account service implementation.

use log::debug;
use std::sync::{Arc, RwLock};

use super::accounts_model::{get_tracking_mode, Account, AccountUpdate, NewAccount};
use super::accounts_traits::{AccountRepositoryTrait, AccountServiceTrait};
use crate::errors::Result;
use crate::events::{CurrencyChange, DomainEvent, DomainEventSink};
use crate::fx::FxServiceTrait;

/// Service for managing accounts.
pub struct AccountService {
    repository: Arc<dyn AccountRepositoryTrait>,
    fx_service: Arc<dyn FxServiceTrait>,
    base_currency: Arc<RwLock<String>>,
    event_sink: Arc<dyn DomainEventSink>,
}

impl AccountService {
    /// Creates a new AccountService instance.
    pub fn new(
        repository: Arc<dyn AccountRepositoryTrait>,
        fx_service: Arc<dyn FxServiceTrait>,
        base_currency: Arc<RwLock<String>>,
        event_sink: Arc<dyn DomainEventSink>,
    ) -> Self {
        Self {
            repository,
            fx_service,
            base_currency,
            event_sink,
        }
    }
}

#[async_trait::async_trait]
impl AccountServiceTrait for AccountService {
    /// Creates a new account with currency exchange support.
    async fn create_account(&self, new_account: NewAccount) -> Result<Account> {
        let base_currency = self.base_currency.read().unwrap().clone();
        debug!(
            "Creating account..., base_currency: {}, new_account.currency: {}",
            base_currency, new_account.currency
        );

        // Perform async currency pair registration if needed
        if new_account.currency != base_currency {
            self.fx_service
                .register_currency_pair(new_account.currency.as_str(), base_currency.as_str())
                .await?;
        }

        // Repository handles transaction internally
        let result = self.repository.create(new_account).await?;

        // Emit AccountsChanged event with currency info for FX sync planning
        let currency_changes = vec![CurrencyChange {
            account_id: result.id.clone(),
            old_currency: None,
            new_currency: result.currency.clone(),
        }];
        self.event_sink.emit(DomainEvent::accounts_changed(
            vec![result.id.clone()],
            currency_changes,
        ));

        Ok(result)
    }

    /// Updates an existing account.
    async fn update_account(&self, account_update: AccountUpdate) -> Result<Account> {
        // Get existing account to detect changes
        let account_id = account_update.id.as_ref().ok_or_else(|| {
            crate::Error::Validation(crate::errors::ValidationError::InvalidInput(
                "Account ID is required".to_string(),
            ))
        })?;
        let existing = self.repository.get_by_id(account_id)?;

        let result = self.repository.update(account_update).await?;

        // Detect currency changes
        let currency_changes = if existing.currency != result.currency {
            vec![CurrencyChange {
                account_id: result.id.clone(),
                old_currency: Some(existing.currency.clone()),
                new_currency: result.currency.clone(),
            }]
        } else {
            vec![]
        };

        // Emit AccountsChanged event
        self.event_sink.emit(DomainEvent::accounts_changed(
            vec![result.id.clone()],
            currency_changes,
        ));

        // Detect tracking mode changes
        let old_mode = get_tracking_mode(&existing);
        let new_mode = get_tracking_mode(&result);
        if old_mode != new_mode {
            let is_connected = result.provider_account_id.is_some();
            self.event_sink.emit(DomainEvent::tracking_mode_changed(
                result.id.clone(),
                old_mode,
                new_mode,
                is_connected,
            ));
        }

        Ok(result)
    }

    /// Retrieves an account by its ID.
    fn get_account(&self, account_id: &str) -> Result<Account> {
        self.repository.get_by_id(account_id)
    }

    /// Lists all accounts with optional filtering by active status and account IDs.
    fn list_accounts(
        &self,
        is_active_filter: Option<bool>,
        account_ids: Option<&[String]>,
    ) -> Result<Vec<Account>> {
        self.repository.list(is_active_filter, account_ids)
    }

    /// Lists all accounts.
    fn get_all_accounts(&self) -> Result<Vec<Account>> {
        self.repository.list(None, None)
    }

    /// Lists only active accounts.
    fn get_active_accounts(&self) -> Result<Vec<Account>> {
        self.list_accounts(Some(true), None)
    }

    /// Retrieves multiple accounts by their IDs.
    fn get_accounts_by_ids(&self, account_ids: &[String]) -> Result<Vec<Account>> {
        self.list_accounts(None, Some(account_ids))
    }

    /// Deletes an account by its ID.
    async fn delete_account(&self, account_id: &str) -> Result<()> {
        self.repository.delete(account_id).await?;

        // Emit AccountsChanged event (no currency changes on delete)
        self.event_sink.emit(DomainEvent::accounts_changed(
            vec![account_id.to_string()],
            vec![],
        ));

        Ok(())
    }
}
