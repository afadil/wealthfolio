use crate::account::AccountService;
use crate::activity::ActivityRepository;
use crate::asset::asset_service::AssetService;
use crate::fx::fx_service::CurrencyExchangeService;
use crate::models::{
    Activity, ActivityImport, ActivitySearchResponse, ActivityUpdate, NewActivity, Sort,
};
use crate::schema::activities;

use diesel::prelude::*;
use diesel::sql_types::{Double, Text};

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

            // Handle different activity types
            match activity.activity_type.as_str() {
                "TRANSFER_OUT" => {
                    // Calculate the current average cost for the asset in this account
                    let current_avg_cost = self.calculate_average_cost(
                        conn,
                        &activity.account_id,
                        &activity.asset_id,
                    )?;
                    activity.unit_price = current_avg_cost;
                }
                "DEPOSIT" | "WITHDRAWAL" | "INTEREST" | "FEE" | "DIVIDEND" => {
                    activity.quantity = 1.0;
                }
                _ => {}
            }

            // Create exchange rate if asset currency is different from account currency
            if activity.currency != account.currency {
                let fx_service = CurrencyExchangeService::new();
                fx_service.add_exchange_rate(
                    conn,
                    account.currency.clone(),
                    activity.currency.clone(),
                    None,
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

            // Handle different activity types
            match activity.activity_type.as_str() {
                "TRANSFER_OUT" => {
                    // Calculate the current average cost for the asset in this account
                    let current_avg_cost = self.calculate_average_cost(
                        conn,
                        &activity.account_id,
                        &activity.asset_id,
                    )?;
                    activity.unit_price = current_avg_cost;
                }
                "DEPOSIT" | "WITHDRAWAL" | "INTEREST" | "FEE" | "DIVIDEND" => {
                    activity.quantity = 1.0;
                }
                _ => {}
            }

            // Create exchange rate if asset currency is different from account currency
            if activity.currency != account.currency {
                let fx_service = CurrencyExchangeService::new();
                fx_service.add_exchange_rate(
                    conn,
                    account.currency.clone(),
                    activity.currency.clone(),
                    None,
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
        account_id: String,
        activities: Vec<ActivityImport>,
    ) -> Result<Vec<ActivityImport>, String> {
        let asset_service = AssetService::new().await;
        let account_service = AccountService::new(self.base_currency.clone());
        let fx_service = CurrencyExchangeService::new();
        let account = account_service
            .get_account_by_id(conn, &account_id)
            .map_err(|e| e.to_string())?;

        let mut activities_with_status: Vec<ActivityImport> = Vec::new();
        let mut symbols_to_sync: Vec<String> = Vec::new();

        for mut activity in activities {
            activity.id = Some(Uuid::new_v4().to_string());
            activity.account_name = Some(account.name.clone());

            // Load the symbol profile
            let symbol_profile_result = asset_service
                .get_asset_profile(conn, &activity.symbol, Some(false))
                .await;

            // Check if symbol profile is valid
            let (is_valid, error) = match symbol_profile_result {
                Ok(profile) => {
                    activity.symbol_name = profile.name;
                    symbols_to_sync.push(activity.symbol.clone());

                    // Add exchange rate if the activity currency is different from the account currency
                    let currency = &activity.currency;
                    if currency != &account.currency {
                        match fx_service.add_exchange_rate(
                            conn,
                            account.currency.clone(),
                            currency.clone(),
                            None,
                        ) {
                            Ok(_) => (),
                            Err(e) => {
                                let error_msg = format!(
                                    "Failed to add exchange rate for {}/{}. Error: {}. Line: {}",
                                    &account.currency,
                                    currency,
                                    e,
                                    activity.line_number.unwrap()
                                );
                                return Err(error_msg);
                            }
                        }
                    }

                    (true, None)
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

        // Sync quotes for all valid symbols
        // if !symbols_to_sync.is_empty() {
        //     asset_service
        //         .sync_symbol_quotes(conn, &symbols_to_sync)
        //         .await?;
        // }

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

    fn calculate_average_cost(
        &self,
        conn: &mut SqliteConnection,
        account_id: &str,
        asset_id: &str,
    ) -> Result<f64, Box<dyn std::error::Error>> {
        #[derive(QueryableByName, Debug)]
        struct AverageCost {
            #[diesel(sql_type = Double)]
            average_cost: f64,
        }

        let result: AverageCost = diesel::sql_query(
            r#"
            WITH running_totals AS (
                SELECT
                    quantity,
                    unit_price,
                    quantity AS quantity_change,
                    quantity * unit_price AS value_change,
                    SUM(quantity) OVER (ORDER BY activity_date, id) AS running_quantity,
                    SUM(quantity * unit_price) OVER (ORDER BY activity_date, id) AS running_value
                FROM activities
                WHERE account_id = ?1 AND asset_id = ?2
                  AND activity_type IN ('BUY', 'TRANSFER_IN')
            )
            SELECT
                CASE
                    WHEN SUM(quantity_change) > 0 THEN SUM(value_change) / SUM(quantity_change)
                    ELSE 0
                END AS average_cost
            FROM running_totals
            "#,
        )
        .bind::<Text, _>(account_id)
        .bind::<Text, _>(asset_id)
        .get_result(conn)?;

        Ok(result.average_cost)
    }
}
