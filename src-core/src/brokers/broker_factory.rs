use std::sync::Arc;
use crate::models::Account;
use crate::brokers::broker_provider::{BrokerApiConfig, BrokerProvider, BrokerError};
use crate::brokers::brokers::{
    coinbase_provider::CoinbaseProvider,
    trading212_provider::Trading212Provider,
};
use log::debug; // for debugging 

pub struct BrokerProviderFactory;

impl BrokerProviderFactory {
    pub async fn from_account(account: &Account) -> Result<Arc<dyn BrokerProvider>, BrokerError> {
        let decrypted_api_key = account
            .broker_api
            .as_ref()
            .ok_or(BrokerError::MissingApiData)?
            .0
            .clone();
        debug!("Key decrypted {}", decrypted_api_key);
        match account.broker.as_deref() {
            Some("TRADING212") => {
                let config = BrokerApiConfig {
                    api_key: decrypted_api_key,
                    ..Default::default()
                };
                Ok(Arc::new(Trading212Provider::new(config).await?))
            }
            Some("COINBASE") => {
                let config = BrokerApiConfig {
                    api_key: decrypted_api_key,
                    ..Default::default()
                };
                Ok(Arc::new(CoinbaseProvider::new(config).await?))
            }
            Some(b) => Err(BrokerError::UnsupportedBroker(b.to_string())),
            None => Err(BrokerError::MissingBrokerName),
        }
    }    
}
