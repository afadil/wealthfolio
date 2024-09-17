use crate::account::AccountRepository;
use crate::asset::asset_service::AssetService;
use crate::models::{Account, AccountUpdate, NewAccount};
use crate::settings::SettingsService;
use diesel::r2d2::{ConnectionManager, Pool};
use diesel::Connection;
use diesel::SqliteConnection;

pub struct AccountService {
    account_repo: AccountRepository,
    pool: Pool<ConnectionManager<SqliteConnection>>,
}

impl AccountService {
    pub fn new(pool: Pool<ConnectionManager<SqliteConnection>>) -> Self {
        AccountService {
            account_repo: AccountRepository::new(),
            pool,
        }
    }

    pub fn get_accounts(&self) -> Result<Vec<Account>, diesel::result::Error> {
        let mut conn = self.pool.get().expect("Couldn't get db connection");
        self.account_repo.load_accounts(&mut conn)
    }

    pub fn get_account_by_id(&self, account_id: &str) -> Result<Account, diesel::result::Error> {
        let mut conn = self.pool.get().expect("Couldn't get db connection");
        self.account_repo.load_account_by_id(&mut conn, account_id)
    }

    pub fn create_account(
        &self,
        new_account: NewAccount,
    ) -> Result<Account, Box<dyn std::error::Error>> {
        let mut conn = self.pool.get()?;
        let asset_service = AssetService::new(self.pool.clone());
        let settings_service = SettingsService::new();

        conn.transaction(|conn| {
            let settings = settings_service.get_settings(conn)?;
            let base_currency = settings.base_currency;

            // Create exchange rate asset if necessary
            if new_account.currency != base_currency {
                let asset_id = format!("{}{}=X", base_currency, new_account.currency);
                if asset_service.get_asset_by_id(&asset_id).is_err() {
                    asset_service.create_rate_exchange_asset(
                        conn,
                        &base_currency,
                        &new_account.currency,
                    )?;
                }
            }

            // Create cash ($CASH-CURRENCY) asset if necessary
            let cash_asset_id = format!("$CASH-{}", new_account.currency);
            if asset_service.get_asset_by_id(&cash_asset_id).is_err() {
                asset_service.create_cash_asset(conn, &new_account.currency)?;
            }

            // Insert new account
            self.account_repo
                .insert_new_account(conn, new_account)
                .map_err(|e| Box::new(e) as Box<dyn std::error::Error>)
        })
    }

    pub fn update_account(
        &self,
        updated_account_data: AccountUpdate,
    ) -> Result<Account, diesel::result::Error> {
        let mut conn = self.pool.get().expect("Couldn't get db connection");
        self.account_repo
            .update_account(&mut conn, updated_account_data)
    }

    pub fn delete_account(
        &self,
        account_id_to_delete: String,
    ) -> Result<usize, diesel::result::Error> {
        let mut conn = self.pool.get().expect("Couldn't get db connection");
        self.account_repo
            .delete_account(&mut conn, account_id_to_delete)
    }

    pub fn get_accounts_by_ids(
        &self,
        account_ids: &[String],
    ) -> Result<Vec<Account>, diesel::result::Error> {
        let mut conn = self.pool.get().expect("Couldn't get db connection");
        self.account_repo
            .load_accounts_by_ids(&mut conn, account_ids)
    }
}
