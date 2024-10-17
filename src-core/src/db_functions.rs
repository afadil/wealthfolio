use diesel::prelude::*;
use diesel::result::Error;
use diesel::SqliteConnection;
use diesel::SelectableHelper;
use crate::models::*;
use crate::schema::*;

// Function to insert a new CSV import profile along with its mappings
pub fn insert_csv_import_profile(
    conn: &mut SqliteConnection,
    profile: &CsvImportProfileWithMappings,
) -> Result<(), Error> {
    // Insert the new profile
    let new_profile = NewCsvImportProfile {
        id: profile.id.clone(),
        name: profile.name.clone(),
        account_id: profile.account_id.clone(),
    };

    diesel::insert_into(csv_import_profiles::table)
        .values(&new_profile)
        .execute(conn)?;

    // Insert column mappings
    let new_column_mappings: Vec<NewCsvColumnMapping> = profile
        .column_mappings
        .iter()
        .map(|mapping| NewCsvColumnMapping {
            profile_id: profile.id.clone(),
            csv_column_name: mapping.csv_column_name.clone(),
            app_field_name: mapping.app_field_name.clone(),
        })
        .collect();

    if !new_column_mappings.is_empty() {
        diesel::insert_into(csv_column_mappings::table)
            .values(&new_column_mappings)
            .execute(conn)?;
    }

    // Insert transaction type mappings
    let new_transaction_type_mappings: Vec<NewCsvTransactionTypeMapping> = profile
        .transaction_type_mappings
        .iter()
        .map(|mapping| NewCsvTransactionTypeMapping {
            profile_id: profile.id.clone(),
            csv_transaction_type: mapping.csv_transaction_type.clone(),
            app_activity_type: mapping.app_activity_type.clone(),
        })
        .collect();

    if !new_transaction_type_mappings.is_empty() {
        diesel::insert_into(csv_transaction_type_mappings::table)
            .values(&new_transaction_type_mappings)
            .execute(conn)?;
    }

    Ok(())
}

// Function to retrieve CSV import profiles for a given account ID
pub fn get_csv_import_profiles(
    conn: &mut SqliteConnection,
    account_id_filter: &str,
) -> Result<Vec<CsvImportProfileWithMappings>, Error> {
    use crate::schema::csv_import_profiles::dsl::*;

    let profiles = csv_import_profiles
        .filter(account_id.eq(account_id_filter))
        .load::<CsvImportProfile>(conn)?;  // Load the profiles

    let mut profiles_with_mappings = Vec::new();

    for profile in profiles {
        let column_mappings = get_column_mappings(conn, &profile.id)?;
        let transaction_type_mappings = get_transaction_type_mappings(conn, &profile.id)?;

        profiles_with_mappings.push(CsvImportProfileWithMappings {
            id: profile.id,
            name: profile.name,
            account_id: profile.account_id,
            column_mappings,
            transaction_type_mappings,
        });
    }

    Ok(profiles_with_mappings)
}



// Function to retrieve column mappings for a given profile ID
pub fn get_column_mappings(
    conn: &mut SqliteConnection,
    profile_id_filter: &str,
) -> Result<Vec<CsvColumnMapping>, Error> {
    use crate::schema::csv_column_mappings::dsl::*;

    let mappings = csv_column_mappings
        .filter(profile_id.eq(profile_id_filter))
        .select(CsvColumnMapping::as_select())
        .load::<CsvColumnMapping>(conn)?;

    Ok(mappings)
}

// Function to retrieve transaction type mappings for a given profile ID
pub fn get_transaction_type_mappings(
    conn: &mut SqliteConnection,
    profile_id_filter: &str,
) -> Result<Vec<CsvTransactionTypeMapping>, Error> {
    use crate::schema::csv_transaction_type_mappings::dsl::*;

    let mappings = csv_transaction_type_mappings
        .filter(profile_id.eq(profile_id_filter))
        .select(CsvTransactionTypeMapping::as_select())
        .load::<CsvTransactionTypeMapping>(conn)?;

    Ok(mappings)
}
