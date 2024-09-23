use crate::account::AccountRepository;
use crate::fx::fx_service::CurrencyExchangeService;
use crate::models::{Account, AccountUpdate, NewAccount};
use diesel::r2d2::{ConnectionManager, Pool};
use diesel::Connection;
use diesel::SqliteConnection;

pub struct AccountService {
    account_repo: AccountRepository,
    pool: Pool<ConnectionManager<SqliteConnection>>,
    base_currency: String,
}

impl AccountService {
    pub fn new(pool: Pool<ConnectionManager<SqliteConnection>>, base_currency: String) -> Self {
        AccountService {
            account_repo: AccountRepository::new(),
            pool,
            base_currency,
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

    pub async fn create_account(
        &self,
        new_account: NewAccount,
    ) -> Result<Account, Box<dyn std::error::Error>> {
        let mut conn = self.pool.get()?;
        let base_currency = self.base_currency.clone();

        println!(
            "Creating account..., base_currency: {}, new_account.currency: {}",
            base_currency, new_account.currency
        );
        conn.transaction(|conn| {
            if new_account.currency != base_currency {
                let fx_service = CurrencyExchangeService::new(self.pool.clone());
                fx_service
                    .add_exchange_rate(base_currency.clone(), new_account.currency.clone())?;
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
