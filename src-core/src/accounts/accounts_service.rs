use diesel::prelude::*;
use diesel::r2d2::{self, Pool};
use diesel::sqlite::SqliteConnection;
use diesel::Connection;
use log::debug;
use std::sync::Arc;

use super::accounts_model::{Account, AccountDB, AccountUpdate, NewAccount};
use super::accounts_repository::AccountRepository;
use crate::accounts::{AccountError, Result};
use crate::fx::fx_service::FxService;
use crate::schema;

/// Service for managing accounts
pub struct AccountService {
    pool: Arc<Pool<r2d2::ConnectionManager<SqliteConnection>>>,
    base_currency: String,
    fx_service: FxService,
}

impl AccountService {
    /// Creates a new AccountService instance
    pub fn new(pool: Arc<Pool<r2d2::ConnectionManager<SqliteConnection>>>, base_currency: String) -> Self {
        let fx_service = FxService::new(pool.clone());
        Self { pool, base_currency, fx_service }
    }

    /// Creates a new account with currency exchange support
    pub async fn create_account(&self, new_account: NewAccount) -> Result<Account> {
        let base_currency = self.base_currency.clone();
        debug!(
            "Creating account..., base_currency: {}, new_account.currency: {}",
            base_currency, new_account.currency
        );

        let mut conn = self.pool.get()
            .map_err(|e| AccountError::DatabaseError(e.to_string()))?;

        conn.transaction(|tx_conn| {
            if new_account.currency != base_currency {
                // Register the currency pair if it's different from base currency
                self.fx_service.register_currency_pair(
                    new_account.currency.as_str(),
                    base_currency.as_str(),
                )
                .map_err(|e| AccountError::DatabaseError(e.to_string()))?;
            }

            let new_account = new_account.clone();
            new_account.validate()?;

            let mut account_db: AccountDB = new_account.into();
            account_db.id = uuid::Uuid::new_v4().to_string();
            
            diesel::insert_into(schema::accounts::table)
                .values(&account_db)
                .execute(tx_conn)
                .map_err(|e| AccountError::DatabaseError(e.to_string()))?;

            Ok(account_db.into())
        })
        .map_err(|e| match e {
            AccountError::DatabaseError(msg) => AccountError::DatabaseError(format!("Transaction failed: {}", msg)),
            other => other,
        })
    }

    /// Updates an existing account
    pub fn update_account(&self, account_update: AccountUpdate) -> Result<Account> {
        let repo = AccountRepository::new(self.pool.clone());
        repo.update(account_update)
    }

    /// Retrieves an account by its ID
    pub fn get_account(&self, account_id: &str) -> Result<Account> {
        let repo = AccountRepository::new(self.pool.clone());
        repo.get_by_id(account_id)
    }

    /// Lists all accounts with optional filtering by active status and account IDs
    pub fn list_accounts(
        &self,
        is_active_filter: Option<bool>,
        account_ids: Option<&[String]>,
    ) -> Result<Vec<Account>> {
        let repo = AccountRepository::new(self.pool.clone());
        repo.list(is_active_filter, account_ids)
    }

    /// Lists all accounts
    pub fn get_all_accounts(&self) -> Result<Vec<Account>> {
        let repo = AccountRepository::new(self.pool.clone());
        repo.list(None, None)
    }

    /// Lists only active accounts
    pub fn get_active_accounts(&self) -> Result<Vec<Account>> {
        self.list_accounts(Some(true), None)
    }

    /// Retrieves multiple accounts by their IDs
    pub fn get_accounts_by_ids(&self, account_ids: &[String]) -> Result<Vec<Account>> {
        self.list_accounts(None, Some(account_ids))
    }

    /// Deletes an account by its ID
    pub fn delete_account(&self, account_id: &str) -> Result<()> {
        let repo = AccountRepository::new(self.pool.clone());
        repo.delete(account_id)?;
        Ok(())
    }
} 