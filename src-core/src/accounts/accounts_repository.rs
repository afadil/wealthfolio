use diesel::prelude::*;
use diesel::r2d2::{self, Pool};
use diesel::sqlite::SqliteConnection;
use std::sync::Arc;

use crate::accounts::{AccountError, Result};
use crate::schema::accounts;
use crate::schema::accounts::dsl::*;
use crate::db::get_connection;

use super::accounts_model::{Account, AccountDB, AccountUpdate, NewAccount};

/// Repository for managing account data in the database
pub struct AccountRepository {
    pool: Arc<Pool<r2d2::ConnectionManager<SqliteConnection>>>,
}

impl AccountRepository {
    /// Creates a new AccountRepository instance
    pub fn new(pool: Arc<Pool<r2d2::ConnectionManager<SqliteConnection>>>) -> Self {
        Self { pool }
    }

    /// Creates a new account in the database
    pub fn create(&self, new_account: NewAccount) -> Result<Account> {
        new_account.validate()?;

        let mut account_db: AccountDB = new_account.into();
        account_db.id = uuid::Uuid::new_v4().to_string();
        
        let mut conn = get_connection(&self.pool)
            .map_err(|e| AccountError::DatabaseError(e.to_string()))?;

        diesel::insert_into(accounts::table)
            .values(&account_db)
            .execute(&mut conn)
            .map_err(|e| AccountError::DatabaseError(e.to_string()))?;

        Ok(account_db.into())
    }

    /// Updates an existing account in the database
    pub fn update(&self, account_update: AccountUpdate) -> Result<Account> {
        account_update.validate()?;

        let mut conn = get_connection(&self.pool)
            .map_err(|e| AccountError::DatabaseError(e.to_string()))?;

        let mut account_db: AccountDB = account_update.into();
        let existing = accounts
            .find(&account_db.id)
            .first::<AccountDB>(&mut conn)
            .map_err(|e| AccountError::DatabaseError(e.to_string()))?;

        account_db.currency = existing.currency;
        account_db.created_at = existing.created_at;
        account_db.updated_at = chrono::Utc::now().naive_utc();

        diesel::update(accounts.find(&account_db.id))
            .set(&account_db)
            .execute(&mut conn)
            .map_err(|e| AccountError::DatabaseError(e.to_string()))?;

        Ok(account_db.into())
    }

    /// Retrieves an account by its ID
    pub fn get_by_id(&self, account_id: &str) -> Result<Account> {
        let mut conn = get_connection(&self.pool)
            .map_err(|e| AccountError::DatabaseError(e.to_string()))?;

        let account = accounts
            .find(account_id)
            .first::<AccountDB>(&mut conn)
            .map_err(|e| match e {
                diesel::result::Error::NotFound => {
                    AccountError::NotFound(format!("Account with id {} not found", account_id))
                }
                _ => AccountError::DatabaseError(e.to_string()),
            })?;

        Ok(account.into())
    }

    /// Lists accounts in the database, optionally filtering by active status and account IDs
    pub fn list(&self, is_active_filter: Option<bool>, account_ids: Option<&[String]>) -> Result<Vec<Account>> {
        let mut conn = get_connection(&self.pool)
            .map_err(|e| AccountError::DatabaseError(e.to_string()))?;

        let mut query = accounts::table.into_boxed();
        
        if let Some(active) = is_active_filter {
            query = query.filter(is_active.eq(active));
        }

        if let Some(ids) = account_ids {
            query = query.filter(id.eq_any(ids));
        }

        query
            .order((is_active.desc(), name.asc()))
            .load::<AccountDB>(&mut conn)
            .map_err(|e| AccountError::DatabaseError(e.to_string()))
            .map(|results| results.into_iter().map(Account::from).collect())
    }

    /// Deletes an account by its ID and returns the number of deleted records
    pub fn delete(&self, account_id: &str) -> Result<usize> {
        let mut conn = get_connection(&self.pool)
            .map_err(|e| AccountError::DatabaseError(e.to_string()))?;

        let affected = diesel::delete(accounts.find(account_id))
            .execute(&mut conn)
            .map_err(|e| AccountError::DatabaseError(e.to_string()))?;

        if affected == 0 {
            return Err(AccountError::NotFound(format!(
                "Account with id {} not found",
                account_id
            )));
        }

        Ok(affected)
    }
} 