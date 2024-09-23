use std::fs::File;

use crate::account::AccountService;
use crate::activity::ActivityRepository;
use crate::asset::asset_service::AssetService;
use crate::fx::fx_service::CurrencyExchangeService;
use crate::models::{
    Activity, ActivityImport, ActivitySearchResponse, ActivityUpdate, IncomeData, NewActivity, Sort,
};
use crate::schema::activities;

use csv::ReaderBuilder;
use diesel::prelude::*;

use uuid::Uuid;

pub struct ActivityService {
    repo: ActivityRepository,
    base_currency: String,
}

impl ActivityService {
    pub fn new(base_currency: String) -> Self {
        ActivityService {
            repo: ActivityRepository::new(),
            base_currency,
        }
    }

    //load all activities
    pub fn get_activities(
        &self,
        conn: &mut SqliteConnection,
    ) -> Result<Vec<Activity>, diesel::result::Error> {
        self.repo.get_activities(conn)
    }

    pub fn get_trading_activities(
        &self,
        conn: &mut SqliteConnection,
    ) -> Result<Vec<Activity>, diesel::result::Error> {
        self.repo.get_trading_activities(conn)
    }

    pub fn get_income_data(
        &self,
        conn: &mut SqliteConnection,
    ) -> Result<Vec<IncomeData>, diesel::result::Error> {
        self.repo.get_income_activities(conn).map(|results| {
            results
                .into_iter()
                .map(|activity| IncomeData {
                    date: activity.activity_date,
                    income_type: activity.activity_type,
                    symbol: activity.asset_id,
                    amount: activity.quantity * activity.unit_price,
                    currency: activity.currency,
                })
                .collect()
        })
    }

    pub fn search_activities(
        &self,
        conn: &mut SqliteConnection,
        page: i64,                                 // Page number, 1-based
        page_size: i64,                            // Number of items per page
        account_id_filter: Option<Vec<String>>,    // Optional account_id filter
        activity_type_filter: Option<Vec<String>>, // Optional activity_type filter
        asset_id_keyword: Option<String>,          // Optional asset_id keyword for search
        sort: Option<Sort>,                        // Optional sort
    ) -> Result<ActivitySearchResponse, diesel::result::Error> {
        self.repo.search_activities(
            conn,
            page,
            page_size,
            account_id_filter,
            activity_type_filter,
            asset_id_keyword,
            sort,
        )
    }

    //create a new activity and fetch related the asset profile
    pub async fn create_activity(
        &self,
        conn: &mut SqliteConnection,
        mut activity: NewActivity,
    ) -> Result<Activity, Box<dyn std::error::Error>> {
        let asset_id = activity.asset_id.clone();
        let asset_service = AssetService::new().await;
        let account_service = AccountService::new(self.base_currency.clone());
        let asset_profile = asset_service
            .get_asset_profile(conn, &asset_id, Some(true))
            .await?;
        let account = account_service.get_account_by_id(conn, &activity.account_id)?;

        conn.transaction(|conn| {
            // Update activity currency if asset_profile.currency is available
            if !asset_profile.currency.is_empty() {
                activity.currency = asset_profile.currency.clone();
            }
            // Adjust unit price based on activity type
            if ["DEPOSIT", "WITHDRAWAL", "INTEREST", "FEE", "DIVIDEND"]
                .contains(&activity.activity_type.as_str())
            {
                activity.unit_price = 1.0;
            }

            // Create exchange rate if asset currency is different from account currency
            if activity.currency != account.currency {
                let fx_service = CurrencyExchangeService::new();
                fx_service.add_exchange_rate(
                    conn,
                    account.currency.clone(),
                    activity.currency.clone(),
                )?;
            }

            // Insert the new activity into the database
            let inserted_activity = self.repo.insert_new_activity(conn, activity)?;

            Ok(inserted_activity)
        })
    }

    // update an activity
    pub async fn update_activity(
        &self,
        conn: &mut SqliteConnection,
        mut activity: ActivityUpdate,
    ) -> Result<Activity, Box<dyn std::error::Error>> {
        let asset_service = AssetService::new().await;
        let account_service = AccountService::new(self.base_currency.clone());
        let asset_profile = asset_service
            .get_asset_profile(conn, &activity.asset_id, Some(true))
            .await?;
        let account = account_service.get_account_by_id(conn, &activity.account_id)?;

        conn.transaction(|conn| {
            // Update activity currency if asset_profile.currency is available
            if !asset_profile.currency.is_empty() {
                activity.currency = asset_profile.currency.clone();
            }
            // Adjust unit price based on activity type
            if ["DEPOSIT", "WITHDRAWAL", "INTEREST", "FEE", "DIVIDEND"]
                .contains(&activity.activity_type.as_str())
            {
                activity.unit_price = 1.0;
            }

            // Create exchange rate if asset currency is different from account currency
            if activity.currency != account.currency {
                let fx_service = CurrencyExchangeService::new();
                fx_service.add_exchange_rate(
                    conn,
                    account.currency.clone(),
                    activity.currency.clone(),
                )?;
            }

            // Update the activity in the database
            let updated_activity = self.repo.update_activity(conn, activity)?;

            Ok(updated_activity)
        })
    }

    // verify the activities import from csv file
    pub async fn check_activities_import(
        &self,
        conn: &mut SqliteConnection,
        _account_id: String,
        file_path: String,
    ) -> Result<Vec<ActivityImport>, String> {
        let asset_service = AssetService::new().await;
        let account_service = AccountService::new(self.base_currency.clone());
        let fx_service = CurrencyExchangeService::new();
        let account = account_service
            .get_account_by_id(conn, &_account_id)
            .map_err(|e| e.to_string())?;

        let file = File::open(&file_path).map_err(|e| e.to_string())?;
        let mut rdr = ReaderBuilder::new()
            .delimiter(b',')
            .has_headers(true)
            .from_reader(file);
        let mut activities_with_status: Vec<ActivityImport> = Vec::new();
        let mut symbols_to_sync: Vec<String> = Vec::new();

        for (line_number, result) in rdr.deserialize().enumerate() {
            let line_number = line_number + 1; // Adjust for human-readable line number
            let mut activity_import: ActivityImport = result.map_err(|e| e.to_string())?;

            // Load the symbol profile here, now awaiting the async call
            let symbol_profile_result = asset_service
                .get_asset_profile(conn, &activity_import.symbol, Some(false))
                .await;

            // Check if symbol profile is valid
            let (is_valid, error) = match symbol_profile_result {
                Ok(profile) => {
                    activity_import.symbol_name = profile.name;
                    symbols_to_sync.push(activity_import.symbol.clone());

                    // Add exchange rate if the activity currency is different from the account currency
                    let currency = &activity_import.currency;
                    if currency != &account.currency {
                        match fx_service.add_exchange_rate(
                            conn,
                            account.currency.clone(),
                            currency.clone(),
                        ) {
                            Ok(_) => (),
                            Err(e) => {
                                let error_msg = format!(
                                    "Failed to add exchange rate for {}/{}. Error: {}. Line: {}",
                                    &account.currency, currency, e, line_number
                                );
                                return Err(error_msg);
                            }
                        }
                    }

                    (Some("true".to_string()), None)
                }
                Err(_) => {
                    let error_msg = format!(
                        "Symbol {} not found. Line: {}",
                        &activity_import.symbol, line_number
                    );
                    (Some("false".to_string()), Some(error_msg))
                }
            };

            // Update the activity_import with the loaded symbol profile and status
            activity_import.is_draft = Some("true".to_string());
            activity_import.is_valid = is_valid.clone();
            activity_import.error = error.clone();
            activity_import.line_number = Some(line_number as i32);
            activity_import.id = Some(Uuid::new_v4().to_string());
            activity_import.account_id = Some(account.id.clone());
            activity_import.account_name = Some(account.name.clone());
            activities_with_status.push(activity_import);
        }

        // Sync quotes for all valid symbols
        if !symbols_to_sync.is_empty() {
            asset_service
                .sync_symbol_quotes(conn, &symbols_to_sync)
                .await?;
        }

        Ok(activities_with_status)
    }

    // create activities used after the import is verified
    pub fn create_activities(
        &self,
        conn: &mut SqliteConnection,
        activities: Vec<NewActivity>,
    ) -> Result<usize, diesel::result::Error> {
        conn.transaction(|conn| {
            let mut insert_count = 0;
            for new_activity in activities {
                diesel::insert_into(activities::table)
                    .values(&new_activity)
                    .execute(conn)?;
                insert_count += 1;
            }

            Ok(insert_count)
        })
    }

    // delete an activity
    pub fn delete_activity(
        &self,
        conn: &mut SqliteConnection,
        activity_id: String,
    ) -> Result<Activity, diesel::result::Error> {
        self.repo.delete_activity(conn, activity_id)
    }

    pub fn get_activities_by_account_ids(
        &self,
        conn: &mut SqliteConnection,
        account_ids: &[String],
    ) -> Result<Vec<Activity>, diesel::result::Error> {
        self.repo.get_activities_by_account_ids(conn, account_ids)
    }
}
