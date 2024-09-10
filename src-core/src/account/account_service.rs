use crate::account::AccountRepository;
use crate::asset::asset_service::AssetService;
use crate::models::{Account, AccountUpdate, NewAccount};
use crate::settings::SettingsService;
use diesel::prelude::*;
use diesel::SqliteConnection;

pub struct AccountService {
    account_repo: AccountRepository,
    asset_service: AssetService,
}

impl AccountService {
    pub fn new() -> Self {
        AccountService {
            account_repo: AccountRepository::new(),
            asset_service: AssetService::new(),
        }
    }

    pub fn get_accounts(
        &self,
        conn: &mut SqliteConnection,
    ) -> Result<Vec<Account>, diesel::result::Error> {
        self.account_repo.load_accounts(conn)
    }

    //get account by id
    pub fn get_account_by_id(
        &self,
        conn: &mut SqliteConnection,
        account_id: &str,
    ) -> Result<Account, diesel::result::Error> {
        self.account_repo.load_account_by_id(conn, account_id)
    }

    pub fn create_account(
        &self,
        conn: &mut SqliteConnection,
        new_account: NewAccount,
    ) -> Result<Account, diesel::result::Error> {
        //get base currency
        let settings_service = SettingsService::new();
        let settings = settings_service.get_settings(conn)?;
        let base_currency = settings.base_currency.clone();

        conn.transaction(|conn| {
            //if the account currency is not the same as the base currency, then create the exchange rate asset so that we can track the exchange rate
            if new_account.currency != base_currency {
                // Create the $EXCHANGE_RATE asset
                let asset_id = format!("{}{}=X", base_currency, new_account.currency);

                //load the asset profile from the database or create it if not found
                let _asset_profile = self
                    .asset_service
                    .get_asset_by_id(conn, &asset_id)
                    .unwrap_or_default();

                if _asset_profile.id.is_empty() {
                    let _asset_profile = self.asset_service.create_rate_exchange_asset(
                        conn,
                        &base_currency,
                        &new_account.currency,
                    )?;
                }
            }

            // Create the $CASH-CURRENCY asset
            let asset_id = format!("$CASH-{}", new_account.currency);

            //load the asset profile from the database or create it if not found
            let _asset_profile = self
                .asset_service
                .get_asset_by_id(conn, &asset_id)
                .unwrap_or_default();

            if _asset_profile.id.is_empty() {
                let _asset_profile = self
                    .asset_service
                    .create_cash_asset(conn, &new_account.currency)?;
            }

            drop(_asset_profile);
            let account = self.account_repo.insert_new_account(conn, new_account)?;

            Ok(account)
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
        account_id_to_delete: String, // ID of the account to delete
    ) -> Result<usize, diesel::result::Error> {
        self.account_repo.delete_account(conn, account_id_to_delete)
    }
}
