use keyring::Entry;
use crate::errors::{Error, Result};

const USERNAME: &str = "default";
const SERVICE_PREFIX: &str = "wealthfolio_";

/// Provides simple API key storage using the operating system keyring.
pub struct SecretManager;

impl SecretManager {
    fn format_service_id(service: &str) -> String {
        format!("{}{}", SERVICE_PREFIX, service.to_lowercase())
    }

    /// Store an API key for the given service.
    pub fn set_api_key(service: &str, api_key: &str) -> Result<()> {
        let service_id = Self::format_service_id(service);
        let entry = Entry::new(&service_id, USERNAME).map_err(Error::from)?;
        entry.set_password(api_key).map_err(Error::from)
    }

    /// Retrieve an API key for the given service.
    pub fn get_api_key(service: &str) -> Result<Option<String>> {
        let service_id = Self::format_service_id(service);
        let entry = Entry::new(&service_id, USERNAME).map_err(Error::from)?;
        match entry.get_password() {
            Ok(value) => Ok(Some(value)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(Error::from(e)),
        }
    }

    /// Delete an API key for the given service.
    pub fn delete_api_key(service: &str) -> Result<()> {
        let service_id = Self::format_service_id(service);
        let entry = Entry::new(&service_id, USERNAME).map_err(Error::from)?;
        match entry.delete_password() {
            Ok(_) => Ok(()),
            Err(keyring::Error::NoEntry) => Ok(()), // If no entry, it's already "deleted"
            Err(e) => Err(Error::from(e)),
        }
    }
}
