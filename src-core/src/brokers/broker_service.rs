use diesel::prelude::*;
use log::{debug, error};

use crate::models::Account;
use crate::schema::activities::dsl::*;
use crate::brokers::broker_factory::BrokerProviderFactory;
use crate::brokers::broker_provider::get_last_synced_timestamp;
use crate::asset::asset_service::AssetService;

pub struct BrokerDataService;

impl BrokerDataService {
    pub async fn sync_all_accounts(conn: &mut SqliteConnection) -> Result<(), String> {
        use crate::schema::accounts::dsl::*;

        // gets accounts with broker configured
        let account_list: Vec<Account> = accounts 
            .filter(is_api_integrations.eq(true))
            .filter(is_active.eq(true))
            .load::<Account>(conn)
            .map_err(|e| format!("Failed to load accounts: {}", e))?;

        debug!("Get account api list: {:?}", account_list);

        let asset_service = AssetService::new().await;
        for account in account_list {
            match BrokerProviderFactory::from_exchange(&account).await {
                Ok(provider) => {
                    match get_last_synced_timestamp(conn, &account.id) {
                        Ok(last_synced) => {
                            match provider.fetch_activities(last_synced).await {
                                Ok(external_activities) => {
                                    for activity in external_activities {
                                        match asset_service
                                            .get_or_create_asset_by_symbol(conn, &activity.symbol)
                                            .await
                                        {
                                            Ok(asset) => {
                                                let new_activity = activity.to_new_activity(&account.id, &asset.id);

                                                if let Err(e) = diesel::insert_into(activities)
                                                    .values(&new_activity)
                                                    .on_conflict_do_nothing()
                                                    .execute(conn)
                                                {
                                                    error!(
                                                        "Failed to insert activity for {}: {}",
                                                        account.name, e
                                                    );
                                                }
                                            }
                                            Err(e) => {
                                                error!(
                                                    "Failed to resolve asset for symbol {} (account: {}): {:?}",
                                                    activity.symbol, account.name, e
                                                );
                                            }
                                        }
                                    }
                                }
                                Err(e) => {
                                    error!(
                                        "Failed to fetch activities for {}: {:?}",
                                        account.name, e
                                    );
                                }
                            }
                        }
                        Err(e) => {
                            error!(
                                "Failed to get last sync timestamp for {}: {}",
                                account.name, e
                            );
                        }
                    }
                }
                Err(e) => {
                    error!("Failed to initialize broker for {}: {:?}", account.name, e);
                }
            }
        }
        Ok(())
    }
}
