use wealthfolio_core::db_functions::{insert_csv_import_profile, get_csv_import_profiles};
use crate::models::CsvImportProfileWithMappings;
use diesel::SqliteConnection;
use diesel::result::Error;

// Function to insert a new CSV import profile
pub fn add_csv_profile(
    conn: &mut SqliteConnection,
    profile: &CsvImportProfileWithMappings,
) -> Result<(), Error> {
    // Delegate to the function in db_functions.rs
    insert_csv_import_profile(conn, profile)
}

// Function to retrieve CSV import profiles for a given account ID
pub fn fetch_csv_profiles(
    conn: &mut SqliteConnection,
    account_id: &str,
) -> Result<Vec<CsvImportProfileWithMappings>, Error> {
    // Delegate to the function in db_functions.rs
    get_csv_import_profiles(conn, account_id)
}
