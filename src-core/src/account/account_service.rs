use crate::account::AccountRepository;
use crate::fx::fx_service::CurrencyExchangeService;
use crate::models::{
    Account, AccountUpdate, ImportMapping, NewAccount, NewImportMapping,
};
use diesel::Connection;
use diesel::prelude::*;
use diesel::SqliteConnection;
use chrono::Utc;

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

        println!(
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

    /// Retrieves the import mapping for a given account ID.
    pub fn get_account_import_mapping(
        &self,
        conn: &mut SqliteConnection,
        account_id_param: &str,
    ) -> Result<Option<ImportMapping>, diesel::result::Error> {
        use crate::schema::import_mappings::dsl::{import_mappings, account_id};

        // Query the import_mappings table for the given account_id
        let mapping = import_mappings
            .filter(account_id.eq(account_id_param))
            .first::<ImportMapping>(conn)
            .optional()?; // Returns Option<ImportMapping>

        Ok(mapping)
    }

    /// Saves the import mapping for a given account ID.
    pub fn save_account_import_mapping(
        &self,
        conn: &mut SqliteConnection,
        account_id_param: &str,
        new_import_mapping: NewImportMapping,
    ) -> Result<(), diesel::result::Error> {
        use crate::schema::import_mappings::dsl::{import_mappings, account_id};
        use crate::schema::import_mappings::dsl::updated_at as updated_at_col;

        // Ensure the account_id matches
        if new_import_mapping.account_id != account_id_param {
            return Err(diesel::result::Error::RollbackTransaction);
        }

        conn.transaction::<(), diesel::result::Error, _>(|conn| {
            let now = Utc::now().naive_utc();

            // Check if an import mapping already exists for this account_id
            let existing_mapping = import_mappings
                .filter(account_id.eq(account_id_param))
                .first::<ImportMapping>(conn)
                .optional()?;

            if let Some(_) = existing_mapping {
                // Update the existing mapping
                diesel::update(import_mappings.filter(account_id.eq(account_id_param)))
                    .set((
                        crate::schema::import_mappings::dsl::fields_mappings.eq(new_import_mapping.fields_mappings),
                        crate::schema::import_mappings::dsl::activity_type_mappings.eq(new_import_mapping.activity_type_mappings),
                        updated_at_col.eq(now),
                    ))
                    .execute(conn)?;
            } else {
                // Insert a new mapping
                diesel::insert_into(import_mappings)
                    .values(&new_import_mapping)
                    .execute(conn)?;
            }

            Ok(())
        })
    }
}
