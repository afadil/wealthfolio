use chrono::Utc;
use diesel::r2d2::{ConnectionManager, Pool};
use diesel::sqlite::SqliteConnection;
use log::{debug, error, info};
use std::sync::Arc;

use crate::accounts::AccountService;
use crate::activities::activities_model::*;
use crate::activities::ActivityRepository;
use crate::activities::{ActivityError, Result};
use crate::assets::{Asset, AssetService};
use crate::fx::fx_service::FxService;
use uuid::Uuid;

/// Service for managing activities
pub struct ActivityService {
    pool: Arc<Pool<ConnectionManager<SqliteConnection>>>,
    asset_service: AssetService,
    fx_service: FxService,
    base_currency: String,
}

impl ActivityService {
    /// Creates a new ActivityService instance
    pub async fn new(
        pool: Arc<Pool<ConnectionManager<SqliteConnection>>>,
        base_currency: String,
    ) -> Result<Self> {
        Ok(Self {
            pool: pool.clone(),
            asset_service: AssetService::new(pool.clone())
                .await
                .map_err(|e| ActivityError::AssetError(e.to_string()))?,
            fx_service: FxService::new(pool.clone()),
            base_currency,
        })
    }

    /// Retrieves all activities
    pub fn get_activities(&self) -> Result<Vec<Activity>> {
        let repo = ActivityRepository::new(self.pool.clone());
        repo.get_activities()
    }

    /// Retrieves activities by account ID
    pub fn get_activities_by_account_id(&self, account_id: &String) -> Result<Vec<Activity>> {
        let repo = ActivityRepository::new(self.pool.clone());
        repo.get_activities_by_account_id(account_id)
    }

    /// Retrieves activities by account IDs
    pub fn get_activities_by_account_ids(&self, account_ids: &[String]) -> Result<Vec<Activity>> {
        let repo = ActivityRepository::new(self.pool.clone());
        repo.get_activities_by_account_ids(account_ids)
    }

    /// Retrieves all trading activities
    pub fn get_trading_activities(&self) -> Result<Vec<Activity>> {
        let repo = ActivityRepository::new(self.pool.clone());
        repo.get_trading_activities()
    }

    /// Retrieves all income activities
    pub fn get_income_activities(&self) -> Result<Vec<Activity>> {
        let repo = ActivityRepository::new(self.pool.clone());
        repo.get_income_activities()
    }

    /// Searches activities with various filters and pagination
    pub fn search_activities(
        &self,
        page: i64,
        page_size: i64,
        account_id_filter: Option<Vec<String>>,
        activity_type_filter: Option<Vec<String>>,
        asset_id_keyword: Option<String>,
        sort: Option<Sort>,
    ) -> Result<ActivitySearchResponse> {
        let repo = ActivityRepository::new(self.pool.clone());
        repo.search_activities(
            page,
            page_size,
            account_id_filter,
            activity_type_filter,
            asset_id_keyword,
            sort,
        )
    }

    /// Creates a new activity
    pub async fn create_activity(&self, mut activity: NewActivity) -> Result<Activity> {
        info!("Creating activity: {:?}", activity);
        // Fetch the asset profile
        let asset = self
            .asset_service
            .get_or_create_asset(&activity.asset_id)
            .await
            .map_err(|e| ActivityError::AssetError(e.to_string()))?;

        let account_service = AccountService::new(self.pool.clone(), self.base_currency.clone());
        let account = account_service
            .get_account(&activity.account_id)
            .map_err(|e| ActivityError::DatabaseError(e.to_string()))?;

        // Set activity currency if empty/undefined
        if activity.currency.is_empty() {
            activity.currency = if !asset.currency.is_empty() {
                asset.currency.clone()
            } else {
                account.currency.clone()
            };
        }

        // Register currency if different from account currency
        if activity.currency != account.currency {
            self.fx_service
                .register_currency_pair(account.currency.as_str(), activity.currency.as_str())
                .map_err(|e| ActivityError::CurrencyExchangeError(e.to_string()))?;
        }

        let repo = ActivityRepository::new(self.pool.clone());
        repo.create_activity(activity)
    }

    /// Updates an existing activity
    pub async fn update_activity(&self, mut activity: ActivityUpdate) -> Result<Activity> {
        let asset = self
            .asset_service
            .get_or_create_asset(&activity.asset_id)
            .await
            .map_err(|e| ActivityError::AssetError(e.to_string()))?;

        if let Err(e) = self
            .asset_service
            .sync_asset_quotes(&vec![asset.clone()], true)
            .await
        {
            error!(
                "Failed to sync quotes for asset: {}. Error: {:?}",
                asset.symbol, e
            );
        }

        let account_service = AccountService::new(self.pool.clone(), self.base_currency.clone());
        let account = account_service
            .get_account(&activity.account_id)
            .map_err(|e| ActivityError::DatabaseError(e.to_string()))?;

        // Set activity currency if empty
        if activity.currency.is_empty() {
            activity.currency = if !asset.currency.is_empty() {
                asset.currency.clone()
            } else {
                account.currency.clone()
            };
        }

        // Register currency if different from account currency
        if activity.currency != account.currency {
            self.fx_service
                .register_currency_pair(account.currency.as_str(), activity.currency.as_str())
                .map_err(|e| ActivityError::CurrencyExchangeError(e.to_string()))?;
        }

        let repo = ActivityRepository::new(self.pool.clone());
        repo.update_activity(activity)
    }

    /// Deletes an activity
    pub fn delete_activity(&self, activity_id: String) -> Result<Activity> {
        let repo = ActivityRepository::new(self.pool.clone());
        repo.delete_activity(activity_id)
    }

    /// Verifies the activities import from CSV file
    pub async fn check_activities_import(
        &self,
        account_id: String,
        activities: Vec<ActivityImport>,
    ) -> Result<Vec<ActivityImport>> {
        let account_service = AccountService::new(self.pool.clone(), self.base_currency.clone());
        let account = account_service
            .get_account(&account_id)
            .map_err(|e| ActivityError::DatabaseError(e.to_string()))?;

        let mut activities_with_status: Vec<ActivityImport> = Vec::new();
        let mut assets_to_sync: Vec<Asset> = Vec::new();

        for mut activity in activities {
            activity.id = Some(Uuid::new_v4().to_string());
            activity.account_name = Some(account.name.clone());
            activity.account_id = Some(account_id.clone());

            // Load the symbol profile
            let symbol_profile_result = self
                .asset_service
                .get_or_create_asset(&activity.symbol)
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
                        match self.fx_service.register_currency_pair(
                            account.currency.as_str(),
                            activity.currency.as_str(),
                        ) {
                            Ok(_) => (true, None),
                            Err(e) => (false, Some(format!("Failed to register currency: {}", e))),
                        }
                    } else {
                        (true, None)
                    }
                }
                Err(_) => {
                    let error_msg =
                        format!("Market data not found for symbol: {}", &activity.symbol);
                    (false, Some(error_msg))
                }
            };

            activity.is_valid = is_valid;
            if let Some(error_msg) = error {
                let mut errors = std::collections::HashMap::new();
                errors.insert("symbol".to_string(), vec![error_msg]);
                activity.errors = Some(errors);
            }

            activities_with_status.push(activity);
        }

        Ok(activities_with_status)
    }

    /// Creates multiple activities in a single transaction
    pub fn create_activities(&self, activities: Vec<NewActivity>) -> Result<usize> {
        let repo = ActivityRepository::new(self.pool.clone());
        repo.create_activities(activities)
    }

    /// Imports activities after validation
    pub async fn import_activities(
        &self,
        account_id: String,
        activities: Vec<ActivityImport>,
    ) -> Result<Vec<ActivityImport>> {
        // First validate the activities
        let validated_activities = self
            .check_activities_import(account_id.clone(), activities)
            .await?;

        // Check if any activity has validation errors
        let has_errors = validated_activities.iter().any(|activity| {
            !activity.is_valid
                || activity
                    .errors
                    .as_ref()
                    .map_or(false, |errors| !errors.is_empty())
        });

        if has_errors {
            // Return the activities with validation errors
            return Ok(validated_activities);
        }

        // Convert to NewActivity objects
        let new_activities: Vec<NewActivity> = validated_activities
            .iter()
            .map(|activity| NewActivity {
                id: activity.id.clone(),
                account_id: activity.account_id.clone().unwrap_or_default(),
                asset_id: activity.symbol.clone(),
                activity_type: activity.activity_type.clone(),
                activity_date: activity.date.clone(),
                quantity: Some(activity.quantity),
                unit_price: Some(activity.unit_price),
                currency: activity.currency.clone(),
                fee: Some(activity.fee),
                amount: activity.amount,
                is_draft: activity.is_draft,
                comment: activity.comment.clone(),
            })
            .collect();

        // Create the activities in the database
        let count = self.create_activities(new_activities)?;
        debug!("Successfully imported {} activities", count);

        Ok(validated_activities)
    }

    /// Gets the first activity date for given account IDs
    pub fn get_first_activity_date(
        &self,
        account_ids: Option<&[String]>,
    ) -> Result<Option<chrono::NaiveDate>> {
        let repo = ActivityRepository::new(self.pool.clone());
        repo.get_first_activity_date(account_ids)
    }

    /// Gets the import mapping for a given account ID
    pub fn get_import_mapping(&self, account_id: String) -> Result<ImportMappingData> {
        let repo = ActivityRepository::new(self.pool.clone());
        let mapping = repo.get_import_mapping(&account_id)?;

        let mut result = match mapping {
            Some(m) => m
                .to_mapping_data()
                .map_err(|e| ActivityError::DatabaseError(e.to_string()))?,
            None => ImportMappingData::default(),
        };
        result.account_id = account_id;
        Ok(result)
    }

    /// Saves or updates an import mapping
    pub fn save_import_mapping(
        &self,
        mapping_data: ImportMappingData,
    ) -> Result<ImportMappingData> {
        let now = Utc::now().naive_utc();
        let new_mapping = ImportMapping {
            account_id: mapping_data.account_id.clone(),
            field_mappings: serde_json::to_string(&mapping_data.field_mappings)
                .map_err(|e| ActivityError::DatabaseError(e.to_string()))?,
            activity_mappings: serde_json::to_string(&mapping_data.activity_mappings)
                .map_err(|e| ActivityError::DatabaseError(e.to_string()))?,
            symbol_mappings: serde_json::to_string(&mapping_data.symbol_mappings)
                .map_err(|e| ActivityError::DatabaseError(e.to_string()))?,
            created_at: now,
            updated_at: now,
        };

        let repo = ActivityRepository::new(self.pool.clone());
        repo.save_import_mapping(&new_mapping)?;

        Ok(mapping_data)
    }
}
