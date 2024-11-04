use crate::account::AccountRepository;
use crate::fx::fx_service::CurrencyExchangeService;
use crate::models::{Account, AccountUpdate, NewAccount};
use diesel::Connection;
use diesel::SqliteConnection;
use log::debug;
pub struct AccountService {
    account_repo: AccountRepository,
    base_currency: String,
}

impl AccountService {
    pub fn new(base_currency: String) -> Self {
        AccountService {
            account_repo: AccountRepository::new(),
            base_currency,
        }
    }

    pub fn get_accounts(
        &self,
        conn: &mut SqliteConnection,
    ) -> Result<Vec<Account>, diesel::result::Error> {
        self.account_repo.load_accounts(conn)
    }

    pub fn get_active_accounts(
        &self,
        conn: &mut SqliteConnection,
    ) -> Result<Vec<Account>, diesel::result::Error> {
        self.account_repo.load_active_accounts(conn)
    }

    pub fn get_account_by_id(
        &self,
        conn: &mut SqliteConnection,
        account_id: &str,
    ) -> Result<Account, diesel::result::Error> {
        self.account_repo.load_account_by_id(conn, account_id)
    }

    pub async fn create_account(
        &self,
        conn: &mut SqliteConnection,
        new_account: NewAccount,
    ) -> Result<Account, Box<dyn std::error::Error>> {
        let base_currency = self.base_currency.clone();
        debug!(
            "Creating account..., base_currency: {}, new_account.currency: {}",
            base_currency, new_account.currency
        );
        conn.transaction(|conn| {
            if new_account.currency != base_currency {
                let fx_service = CurrencyExchangeService::new();
                fx_service.add_exchange_rate(
                    conn,
                    base_currency.clone(),
                    new_account.currency.clone(),
                    None,
                )?;
            }

            // Insert new account
            self.account_repo
                .insert_new_account(conn, new_account)
                .map_err(|e| Box::new(e) as Box<dyn std::error::Error>)
        })
    }

    pub fn update_account(
        &self,
        conn: &mut SqliteConnection,
        updated_account_data: AccountUpdate,
    ) -> Result<Account, diesel::result::Error> {
        self.account_repo.update_account(conn, updated_account_data)
    }

    pub fn delete_account(
        &self,
        conn: &mut SqliteConnection,
        account_id_to_delete: String,
    ) -> Result<usize, diesel::result::Error> {
        self.account_repo.delete_account(conn, account_id_to_delete)
    }

    pub fn get_accounts_by_ids(
        &self,
        conn: &mut SqliteConnection,
        account_ids: &[String],
    ) -> Result<Vec<Account>, diesel::result::Error> {
        self.account_repo.load_accounts_by_ids(conn, account_ids)
    }
}
