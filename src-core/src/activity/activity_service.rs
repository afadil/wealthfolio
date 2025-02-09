use crate::account::AccountService;
use crate::activity::ActivityRepository;
use crate::asset::asset_service::AssetService;
use crate::fx::fx_service::CurrencyExchangeService;
use crate::models::{
    Activity, ActivityImport, ActivitySearchResponse, ActivityUpdate, Asset, ImportMapping,
    ImportMappingData, NewActivity, Sort,
};
use crate::schema::activities;
use log::error;

use diesel::prelude::*;

use uuid::Uuid;

pub struct ActivityService {
    repo: ActivityRepository,
    asset_service: AssetService,
    account_service: AccountService,
    fx_service: CurrencyExchangeService,
}

impl ActivityService {
    pub async fn new(base_currency: String) -> Self {
        ActivityService {
            repo: ActivityRepository::new(),
            asset_service: AssetService::new().await,
            account_service: AccountService::new(base_currency.clone()),
            fx_service: CurrencyExchangeService::new(),
        }
    }

    // For testing purposes
    #[cfg(test)]
    pub fn new_with_mocks(
        asset_service: AssetService,
        account_service: AccountService,
        fx_service: CurrencyExchangeService,
    ) -> Self {
        ActivityService {
            repo: ActivityRepository::new(),
            asset_service,
            account_service,
            fx_service,
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

    pub fn get_income_activities(
        &self,
        conn: &mut SqliteConnection,
    ) -> Result<Vec<Activity>, diesel::result::Error> {
        self.repo.get_income_activities(conn)
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
        // Fetch the asset profile for the activity
        let asset_id = activity.asset_id.clone();
        let asset = self.asset_service.get_or_create_asset(conn, &asset_id).await?;

        let account = self.account_service.get_account_by_id(conn, &activity.account_id)?;
        let account_currency = account.currency;

        // Set activity currency if empty/undefined
        if activity.currency.is_empty() {
            if !asset.currency.is_empty() {
                activity.currency = asset.currency.clone();
            } else {
                activity.currency = account_currency.to_string();
            }
        }

        // Register currency if different from account currency
        if activity.currency != account_currency {
            self.fx_service.register_currency(
                conn,
                account_currency.to_string(),
                activity.currency.clone(),
            ).await?;
        }

        // Handle different activity types
        match activity.activity_type.as_str() {
            "TRANSFER_OUT" => {
                // Calculate the current average cost for the asset in this account
                let current_avg_cost = self.repo.calculate_average_cost(
                    conn,
                    &activity.account_id,
                    &activity.asset_id,
                ).map_err(|e| Box::new(e) as Box<dyn std::error::Error>)?;
                activity.unit_price = current_avg_cost;
            }
            "DEPOSIT" | "WITHDRAWAL" | "INTEREST" | "FEE" | "DIVIDEND" => {
                activity.quantity = 1.0;
            }
            _ => {}
        }

        // Insert the new activity into the database
        let inserted_activity = self.repo.insert_new_activity(conn, activity)?;

        Ok(inserted_activity)
    }

    // update an activity
    pub async fn update_activity(
        &self,
        conn: &mut SqliteConnection,
        mut activity: ActivityUpdate,
    ) -> Result<Activity, Box<dyn std::error::Error>> {
        let asset = self.asset_service
            .get_or_create_asset(conn, &activity.asset_id)
            .await?;

        if let Err(e) = self.asset_service
            .sync_asset_quotes(conn, &vec![asset.clone()])
            .await
        {
            error!(
                "Failed to sync quotes for asset: {}. Error: {:?}",
                asset.symbol, e
            );
        }

        let account = self.account_service.get_account_by_id(conn, &activity.account_id)?;

        // Set activity currency first if empty
        if activity.currency.is_empty() {
            if !asset.currency.is_empty() {
                activity.currency = asset.currency.clone();
            } else {
                activity.currency = account.currency.to_string();
            }
        }

        // Register currency if different from account currency after currency is finalized
        if activity.currency != account.currency {
            self.fx_service.register_currency(
                conn,
                account.currency.clone(),
                activity.currency.clone(),
            ).await?;
        }

        conn.transaction(|conn| {
            // Handle different activity types
            match activity.activity_type.as_str() {
                "TRANSFER_OUT" => {
                    // Calculate the current average cost for the asset in this account
                    let current_avg_cost = self.repo.calculate_average_cost(
                        conn,
                        &activity.account_id,
                        &activity.asset_id,
                    ).map_err(|e| Box::new(e) as Box<dyn std::error::Error>)?;
                    activity.unit_price = current_avg_cost;
                }
                "DEPOSIT" | "WITHDRAWAL" | "INTEREST" | "FEE" | "DIVIDEND" => {
                    activity.quantity = 1.0;
                }
                _ => {}
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
        account_id: String,
        activities: Vec<ActivityImport>,
    ) -> Result<Vec<ActivityImport>, String> {
        let account = self.account_service
            .get_account_by_id(conn, &account_id)
            .map_err(|e| e.to_string())?;

        let mut activities_with_status: Vec<ActivityImport> = Vec::new();
        let mut assets_to_sync: Vec<Asset> = Vec::new();

        for mut activity in activities {
            activity.id = Some(Uuid::new_v4().to_string());
            activity.account_name = Some(account.name.clone());

            // Load the symbol profile
            let symbol_profile_result = self.asset_service
                .get_or_create_asset(conn, &activity.symbol)
                .await;

            // Check if symbol profile is valid
            let (is_valid, error) = match symbol_profile_result {
                Ok(profile) => {
                    activity.symbol_name = profile.name;
                    let asset_copy = Asset {
                        symbol: activity.symbol.clone(),
                        currency: profile.currency.clone(),
                        asset_type: profile.asset_type.clone(),
                        data_source: profile.data_source.clone(),
                        ..Default::default()
                    };
                    assets_to_sync.push(asset_copy);

                    // Create exchange rate if asset currency is different from account currency
                    if activity.currency != account.currency {
                        match self.fx_service.register_currency(
                            conn,
                            account.currency.clone(),
                            activity.currency.clone(),
                        ).await {
                            Ok(_) => (true, None),
                            Err(e) => (false, Some(format!("Failed to register currency: {}", e)))
                        }
                    } else {
                        (true, None)
                    }
                }
                Err(_) => {
                    let error_msg = format!(
                        "Symbol {} not found. Line: {}",
                        &activity.symbol,
                        activity.line_number.unwrap()
                    );
                    (false, Some(error_msg))
                }
            };

            activity.is_valid = is_valid;
            activity.error = error;
            activities_with_status.push(activity);
        }

        // Sync quotes for all valid assets
        if !assets_to_sync.is_empty() {
            match self.asset_service.sync_asset_quotes(conn, &assets_to_sync).await {
                Ok(_) => (),
                Err(e) => {
                    return Err(format!("Failed to sync quotes for assets: {}", e));
                }
            }
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
            for mut new_activity in activities {
                new_activity.id = Some(Uuid::new_v4().to_string());
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

    pub fn get_import_mapping(
        &self,
        conn: &mut SqliteConnection,
        some_account_id: String,
    ) -> Result<ImportMappingData, diesel::result::Error> {
        let mapping = self.repo.get_import_mapping(conn, &some_account_id)?;

        let mut result = match mapping {
            Some(m) => m
                .to_mapping_data()
                .map_err(|e| diesel::result::Error::DeserializationError(Box::new(e)))?,
            None => ImportMappingData::default(),
        };
        result.account_id = some_account_id;
        Ok(result)
    }

    pub fn save_import_mapping(
        &self,
        conn: &mut SqliteConnection,
        mapping_data: ImportMappingData,
    ) -> Result<ImportMappingData, diesel::result::Error> {
        let new_mapping = ImportMapping::from_mapping_data(&mapping_data)
            .map_err(|e| diesel::result::Error::SerializationError(Box::new(e)))?;

        self.repo.save_import_mapping(conn, &new_mapping)?;

        Ok(mapping_data)
    }
}
