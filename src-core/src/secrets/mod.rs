use keyring::Entry;
use crate::errors::{Error, Result};

const USERNAME: &str = "default";
const SERVICE_PREFIX: &str = "wealthfolio_";

/// Provides simple secret storage using the operating system keyring.
pub struct SecretManager;

impl SecretManager {
    fn format_service_id(service: &str) -> String {
        format!("{}{}", SERVICE_PREFIX, service.to_lowercase())
    }

    /// Store a secret for the given service.
    pub fn set_secret(service: &str, secret: &str) -> Result<()> {
        let service_id = Self::format_service_id(service);
        let entry = Entry::new(&service_id, USERNAME).map_err(Error::from)?;
        entry.set_password(secret).map_err(Error::from)
    }

    /// Retrieve a secret for the given service.
    pub fn get_secret(service: &str) -> Result<Option<String>> {
        let service_id = Self::format_service_id(service);
        let entry = Entry::new(&service_id, USERNAME).map_err(Error::from)?;
        match entry.get_password() {
            Ok(value) => Ok(Some(value)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(Error::from(e)),
        }
    }

    /// Delete a secret for the given service.
    pub fn delete_secret(service: &str) -> Result<()> {
        let service_id = Self::format_service_id(service);
        let entry = Entry::new(&service_id, USERNAME).map_err(Error::from)?;
        match entry.delete_password() {
            Ok(_) => Ok(()),
            Err(keyring::Error::NoEntry) => Ok(()), // If no entry, it's already "deleted"
            Err(e) => Err(Error::from(e)),
        }
    }
}
