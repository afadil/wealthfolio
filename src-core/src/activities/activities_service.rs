use chrono::Utc;
use log::{debug, info};
use std::sync::Arc;

use crate::activities::activities_errors::ActivityError;
use crate::accounts::{Account, AccountServiceTrait};
use crate::activities::activities_model::*;
use crate::activities::{ActivityRepositoryTrait, ActivityServiceTrait};
use crate::Result;
use crate::assets::AssetServiceTrait;
use crate::fx::FxServiceTrait;
use uuid::Uuid;

/// Service for managing activities
pub struct ActivityService {
    activity_repository: Arc<dyn ActivityRepositoryTrait>,
    account_service: Arc<dyn AccountServiceTrait>,
    asset_service: Arc<dyn AssetServiceTrait>,
    fx_service: Arc<dyn FxServiceTrait>,
}

impl ActivityService {
    /// Creates a new ActivityService instance with injected dependencies
    pub fn new(
        activity_repository: Arc<dyn ActivityRepositoryTrait>,
        account_service: Arc<dyn AccountServiceTrait>,
        asset_service: Arc<dyn AssetServiceTrait>,
        fx_service: Arc<dyn FxServiceTrait>,
    ) -> Self {
        Self {
            activity_repository,
            account_service,
            asset_service,
            fx_service,
        }
    }
}

#[async_trait::async_trait]
impl ActivityServiceTrait for ActivityService {
    /// Retrieves all activities
    fn get_activities(&self) -> Result<Vec<Activity>> {
        self.activity_repository.get_activities()
    }

    /// Retrieves activities by account ID
    fn get_activities_by_account_id(&self, account_id: &String) -> Result<Vec<Activity>> {
        self.activity_repository
            .get_activities_by_account_id(account_id)
    }

    /// Retrieves activities by account IDs
    fn get_activities_by_account_ids(&self, account_ids: &[String]) -> Result<Vec<Activity>> {
        self.activity_repository
            .get_activities_by_account_ids(account_ids)
    }

    /// Retrieves all trading activities
    fn get_trading_activities(&self) -> Result<Vec<Activity>> {
        self.activity_repository.get_trading_activities()
    }

    /// Retrieves all income activities
    fn get_income_activities(&self) -> Result<Vec<Activity>> {
        self.activity_repository.get_income_activities()
    }

    /// Searches activities with various filters and pagination
    fn search_activities(
        &self,
        page: i64,
        page_size: i64,
        account_id_filter: Option<Vec<String>>,
        activity_type_filter: Option<Vec<String>>,
        asset_id_keyword: Option<String>,
        sort: Option<Sort>,
    ) -> Result<ActivitySearchResponse> {
        self.activity_repository.search_activities(
            page,
            page_size,
            account_id_filter,
            activity_type_filter,
            asset_id_keyword,
            sort,
        )
    }

    /// Creates a new activity
    async fn create_activity(&self, mut activity: NewActivity) -> Result<Activity> {
        info!("Creating activity: {:?}", activity);

        let account: Account = self
            .account_service
            .get_account(&activity.account_id)
            ?;

        // Determine the currency to be used as context for creating the asset, if it needs to be created.
        // Priority: 1. Activity's own currency (if specified), 2. Account's currency.
        let asset_context_currency = if !activity.currency.is_empty() {
            activity.currency.clone()
        } else {
            account.currency.clone() // Fallback to account currency for context
        };

        let asset = self
            .asset_service
            .get_or_create_asset(&activity.asset_id, Some(asset_context_currency))
            .await?;

        // Now, ensure the activity's currency field is set.
        // Priority: 1. Activity's original currency (if specified), 2. Asset's currency
        if activity.currency.is_empty() {
            // asset.currency should now be guaranteed to be non-empty if get_or_create_asset succeeded
            activity.currency = asset.currency.clone();
        }
        

        if activity.currency != account.currency {
            self.fx_service
                .register_currency_pair(account.currency.as_str(), activity.currency.as_str())
                ?;
        }

        self.activity_repository.create_activity(activity)
    }

    /// Updates an existing activity
    async fn update_activity(&self, mut activity: ActivityUpdate) -> Result<Activity> {
        let account: Account = self
            .account_service
            .get_account(&activity.account_id)
            ?;
        
        // Determine context currency for potential asset creation
        let asset_context_currency = if !activity.currency.is_empty() {
            activity.currency.clone()
        } else {
            account.currency.clone() // Fallback
        };

        let asset = self
            .asset_service
            .get_or_create_asset(&activity.asset_id, Some(asset_context_currency))
            .await?;

        // Ensure activity currency is set
        if activity.currency.is_empty() {
            activity.currency = asset.currency.clone();
        }

        if activity.currency != account.currency {
            self.fx_service
                .register_currency_pair(account.currency.as_str(), activity.currency.as_str())
                ?;
        }

        self.activity_repository.update_activity(activity)
    }

    /// Deletes an activity
    fn delete_activity(&self, activity_id: String) -> Result<Activity> {
        self.activity_repository.delete_activity(activity_id)
    }

    /// Verifies the activities import from CSV file
    async fn check_activities_import(
        &self,
        account_id: String,
        activities: Vec<ActivityImport>,
    ) -> Result<Vec<ActivityImport>> {
        let account: Account = self
            .account_service
            .get_account(&account_id)
            ?;

        let mut activities_with_status: Vec<ActivityImport> = Vec::new();

        for mut activity in activities {
            activity.id = Some(Uuid::new_v4().to_string());
            activity.account_name = Some(account.name.clone());
            activity.account_id = Some(account_id.clone());

            // Determine context currency for potential asset creation during check
            let asset_context_currency = if !activity.currency.is_empty() {
                activity.currency.clone()
            } else {
                // Fallback to account currency for context if import data lacks currency
                account.currency.clone() 
            };

            let symbol_profile_result = self
                .asset_service
                .get_or_create_asset(&activity.symbol, Some(asset_context_currency))
                .await;

            let (mut is_valid, mut error_message) = (true, None);

            match symbol_profile_result {
                Ok(asset) => { // symbol_profile_result now returns Asset
                    activity.symbol_name = asset.name; // Use asset name
                    
                    // Check if activity currency (from import) is valid and handle FX
                    if activity.currency.is_empty() {
                        // Activity must have a currency specified in the import
                        is_valid = false;
                        error_message = Some("Activity currency is missing in the import data.".to_string());
                    } else if activity.currency != account.currency {
                        match self.fx_service.register_currency_pair(
                            account.currency.as_str(),
                            activity.currency.as_str(), // Use currency from import data
                        ) {
                            Ok(_) => { /* FX pair registered or already exists */ }
                            Err(e) => {
                                is_valid = false;
                                error_message = Some(format!("Failed to register currency pair for FX: {}", e));
                            }
                        }
                    }
                }
                Err(e) => {
                    // Failed to get or create asset
                    let error_msg = format!("Failed to resolve asset for symbol '{}': {}", &activity.symbol, e);
                    is_valid = false;
                    error_message = Some(error_msg);
                }
            };

            activity.is_valid = is_valid;
            if let Some(error_msg) = error_message {
                let mut errors = std::collections::HashMap::new();
                errors.insert(activity.symbol.clone(), vec![error_msg]); 
                activity.errors = Some(errors);
            }

            activities_with_status.push(activity);
        }

        Ok(activities_with_status)
    }

    /// Imports activities after validation
    async fn import_activities(
        &self,
        account_id: String,
        activities: Vec<ActivityImport>,
    ) -> Result<Vec<ActivityImport>> {
        let validated_activities = self
            .check_activities_import(account_id.clone(), activities)
            .await?;

        let has_errors = validated_activities.iter().any(|activity| {
            !activity.is_valid
                || activity
                    .errors
                    .as_ref()
                    .map_or(false, |errors| !errors.is_empty())
        });

        if has_errors {
            return Ok(validated_activities);
        }

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

        let count = self.activity_repository.create_activities(new_activities)?;
        debug!("Successfully imported {} activities", count);

        Ok(validated_activities)
    }

    /// Gets the first activity date for given account IDs
    fn get_first_activity_date(
        &self,
        account_ids: Option<&[String]>,
    ) -> Result<Option<chrono::DateTime<Utc>>> {
        self.activity_repository
            .get_first_activity_date(account_ids)
    }

    /// Gets the import mapping for a given account ID
    fn get_import_mapping(&self, account_id: String) -> Result<ImportMappingData> {
        let mapping = self
            .activity_repository
            .get_import_mapping(&account_id)?;

        let mut result = match mapping {
            Some(m) => m
                .to_mapping_data()
                .map_err(|e| ActivityError::InvalidData(format!("Failed to parse mapping data: {}", e)))?,
            None => ImportMappingData::default(),
        };
        result.account_id = account_id;
        Ok(result)
    }

    /// Saves or updates an import mapping
    fn save_import_mapping(
        &self,
        mapping_data: ImportMappingData,
    ) -> Result<ImportMappingData> {
        let now = Utc::now().naive_utc();
        let new_mapping = ImportMapping {
            account_id: mapping_data.account_id.clone(),
            field_mappings: serde_json::to_string(&mapping_data.field_mappings)?,
            activity_mappings: serde_json::to_string(&mapping_data.activity_mappings)?,
            symbol_mappings: serde_json::to_string(&mapping_data.symbol_mappings)?,
            created_at: now,
            updated_at: now,
        };

        self.activity_repository.save_import_mapping(&new_mapping)?;

        Ok(mapping_data)
    }
}
