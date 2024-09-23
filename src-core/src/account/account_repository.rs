use crate::models::{Account, AccountUpdate, NewAccount};
use crate::schema::accounts;
use crate::schema::accounts::dsl::*;
use diesel::prelude::*;
use uuid::Uuid;

pub struct AccountRepository;

impl AccountRepository {
    pub fn new() -> Self {
        AccountRepository
    }

    pub fn load_account_by_id(
        &self,
        conn: &mut SqliteConnection,
        account_id: &str,
    ) -> Result<Account, diesel::result::Error> {
        accounts.find(account_id).first::<Account>(conn)
    }

    pub fn load_accounts(
        &self,
        conn: &mut SqliteConnection,
    ) -> Result<Vec<Account>, diesel::result::Error> {
        accounts.order(is_active.desc()).load::<Account>(conn)
    }

    pub fn insert_new_account(
        &self,
        conn: &mut SqliteConnection,
        mut new_account: NewAccount, // Assuming NewAccount is the struct for new account data
    ) -> Result<Account, diesel::result::Error> {
        new_account.id = Some(Uuid::new_v4().to_string());

        diesel::insert_into(accounts::table)
            .values(&new_account)
            .returning(accounts::all_columns) // Adjust this based on your table columns
            .get_result(conn)
    }

    pub fn update_account(
        &self,
        conn: &mut SqliteConnection,
        account_update: AccountUpdate, // Assuming AccountUpdate is the struct for updating account data
    ) -> Result<Account, diesel::result::Error> {
        use crate::schema::accounts::dsl::*;

        // Clone the id before unwrapping it
        let account_id = account_update.id.clone().unwrap();

        diesel::update(accounts.find(account_id))
            .set(&account_update)
            .execute(conn)?;

        accounts
            .filter(id.eq(account_update.id.unwrap()))
            .first(conn)
    }

    pub fn delete_account(
        &self,
        conn: &mut SqliteConnection,
        account_id: String, // ID of the account to delete
    ) -> Result<usize, diesel::result::Error> {
        use crate::schema::accounts::dsl::*;

        diesel::delete(accounts.filter(id.eq(account_id))).execute(conn)
    }

    pub fn load_accounts_by_ids(
        &self,
        conn: &mut SqliteConnection,
        account_ids: &[String],
    ) -> Result<Vec<Account>, diesel::result::Error> {
        accounts
            .filter(id.eq_any(account_ids))
            .filter(is_active.eq(true))
            .order(created_at.desc())
            .load::<Account>(conn)
    }
}
