use async_trait::async_trait;
use diesel::sqlite::SqliteConnection;

use super::accounts_model::{Account, AccountUpdate, NewAccount};
use crate::errors::Result;

/// Trait defining the contract for Account repository operations.
#[async_trait]
pub trait AccountRepositoryTrait: Send + Sync {
    fn create_in_transaction(
        &self,
        new_account: NewAccount,
        conn: &mut SqliteConnection,
    ) -> Result<Account>;
    async fn update(&self, account_update: AccountUpdate) -> Result<Account>;
    async fn delete(&self, account_id: &str) -> Result<usize>;
    fn get_by_id(&self, account_id: &str) -> Result<Account>;
    fn list(
        &self,
        is_active_filter: Option<bool>,
        account_ids: Option<&[String]>,
    ) -> Result<Vec<Account>>;
}

/// Trait defining the contract for Account service operations.
#[async_trait]
pub trait AccountServiceTrait: Send + Sync {
    async fn create_account(&self, new_account: NewAccount) -> Result<Account>;
    async fn update_account(&self, account_update: AccountUpdate) -> Result<Account>;
    async fn delete_account(&self, account_id: &str) -> Result<()>;
    fn get_account(&self, account_id: &str) -> Result<Account>;
    fn list_accounts(
        &self,
        is_active_filter: Option<bool>,
        account_ids: Option<&[String]>,
    ) -> Result<Vec<Account>>;
    fn get_all_accounts(&self) -> Result<Vec<Account>>;
    fn get_active_accounts(&self) -> Result<Vec<Account>>;
    fn get_accounts_by_ids(&self, account_ids: &[String]) -> Result<Vec<Account>>;
}
