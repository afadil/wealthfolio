//! Account service implementation.

use log::debug;
use std::sync::{Arc, RwLock};

use super::accounts_model::{Account, AccountUpdate, NewAccount};
use super::accounts_traits::{AccountRepositoryTrait, AccountServiceTrait};
use crate::errors::Result;
use crate::fx::FxServiceTrait;

/// Service for managing accounts.
pub struct AccountService {
    repository: Arc<dyn AccountRepositoryTrait>,
    fx_service: Arc<dyn FxServiceTrait>,
    base_currency: Arc<RwLock<String>>,
}

impl AccountService {
    /// Creates a new AccountService instance.
    pub fn new(
        repository: Arc<dyn AccountRepositoryTrait>,
        fx_service: Arc<dyn FxServiceTrait>,
        base_currency: Arc<RwLock<String>>,
    ) -> Self {
        Self {
            repository,
            fx_service,
            base_currency,
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
        self.repository.create(new_account).await
    }

    /// Updates an existing account.
    async fn update_account(&self, account_update: AccountUpdate) -> Result<Account> {
        self.repository.update(account_update).await
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
        Ok(())
    }
}
