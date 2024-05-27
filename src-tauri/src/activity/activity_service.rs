use std::fs::File;

use crate::account::AccountService;
use crate::activity::ActivityRepository;
use crate::asset::asset_service::AssetService;
use crate::models::{
    Activity, ActivityImport, ActivitySearchResponse, ActivityUpdate, NewActivity, Sort,
};
use crate::schema::activities;

use csv::ReaderBuilder;
use diesel::prelude::*;
use uuid::Uuid;

pub struct ActivityService {
    repo: ActivityRepository,
    asset_service: AssetService,
    account_service: AccountService,
}

impl ActivityService {
    pub fn new() -> Self {
        ActivityService {
            repo: ActivityRepository::new(),
            asset_service: AssetService::new(),
            account_service: AccountService::new(),
        }
    }

    // delete an activity
    pub fn delete_activity(
        &self,
        conn: &mut SqliteConnection,
        activity_id: String,
    ) -> Result<usize, diesel::result::Error> {
        self.repo.delete_activity(conn, activity_id)
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
    ) -> Result<Activity, diesel::result::Error> {
        // Clone asset_id to avoid moving it
        let asset_id = activity.asset_id.clone();

        // fetch the asset profile from the database or create it if not found
        let _asset_profile = self
            .asset_service
            .get_asset_profile(conn, &asset_id)
            .await?;

        // Adjust unit price based on activity type
        if ["DEPOSIT", "WITHDRAWAL", "INTEREST", "FEE", "DIVIDEND"]
            .contains(&activity.activity_type.as_str())
        {
            activity.unit_price = 1.0;
        }

        // Insert the new activity into the database
        self.repo.insert_new_activity(conn, activity)
    }

    // verify the activities import from csv file
    pub async fn check_activities_import(
        &self,
        conn: &mut SqliteConnection,
        _account_id: String,
        file_path: String,
    ) -> Result<Vec<ActivityImport>, String> {
        let account = self
            .account_service
            .get_account_by_id(conn, &_account_id)
            .map_err(|e| e.to_string())?;

        let file = File::open(&file_path).map_err(|e| e.to_string())?;
        let mut rdr = ReaderBuilder::new()
            .delimiter(b',')
            .has_headers(true)
            .from_reader(file);
        let mut activities_with_status: Vec<ActivityImport> = Vec::new();

        for (line_number, result) in rdr.deserialize().enumerate() {
            let line_number = line_number + 1; // Adjust for human-readable line number
            let mut activity_import: ActivityImport = result.map_err(|e| e.to_string())?;

            // Load the symbol profile here, now awaiting the async call
            let symbol_profile_result = self
                .asset_service
                .get_asset_profile(conn, &activity_import.symbol)
                .await;

            // Check if symbol profile is valid
            let (is_valid, error) = match symbol_profile_result {
                Ok(profile) => {
                    activity_import.symbol_name = profile.name;
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

    // update an activity
    pub fn update_activity(
        &self,
        conn: &mut SqliteConnection,
        activity: ActivityUpdate,
    ) -> Result<Activity, diesel::result::Error> {
        self.repo.update_activity(conn, activity)
    }
}
