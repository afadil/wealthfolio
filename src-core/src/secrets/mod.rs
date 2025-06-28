use keyring::Entry;
use crate::errors::{Error, Result};

const USERNAME: &str = "default";

/// Provides simple API key storage using the operating system keyring.
pub struct SecretManager;

impl SecretManager {
    /// Store an API key for the given service.
    pub fn set_api_key(service: &str, api_key: &str) -> Result<()> {
        let entry = Entry::new(service, USERNAME).map_err(Error::from)?;
        entry.set_password(api_key).map_err(Error::from)
    }

    /// Retrieve an API key for the given service.
    pub fn get_api_key(service: &str) -> Result<Option<String>> {
        let entry = Entry::new(service, USERNAME).map_err(Error::from)?;
        match entry.get_password() {
            Ok(value) => Ok(Some(value)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(Error::from(e)),
        }
    }

    /// Delete an API key for the given service.
    pub fn delete_api_key(service: &str) -> Result<()> {
        let entry = Entry::new(service, USERNAME).map_err(Error::from)?;
        match entry.delete_password() {
            Ok(_) => Ok(()),
            Err(keyring::Error::NoEntry) => Ok(()), // If no entry, it's already "deleted"
            Err(e) => Err(Error::from(e)),
        }
    }
}
