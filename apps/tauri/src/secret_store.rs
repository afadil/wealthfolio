use std::sync::Arc;

use keyring::Entry;

use wealthfolio_core::{
    errors::Error,
    secrets::{format_service_id, SecretStore},
    Result,
};

const USERNAME: &str = "default";

#[derive(Debug, Default)]
pub struct KeyringSecretStore;

impl SecretStore for KeyringSecretStore {
    fn set_secret(&self, service: &str, secret: &str) -> Result<()> {
        let entry = entry_for(service)?;
        entry
            .set_password(secret)
            .map_err(|err| Error::Secret(err.to_string()))
    }

    fn get_secret(&self, service: &str) -> Result<Option<String>> {
        let entry = entry_for(service)?;
        match entry.get_password() {
            Ok(value) => Ok(Some(value)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(err) => Err(Error::Secret(err.to_string())),
        }
    }

    fn delete_secret(&self, service: &str) -> Result<()> {
        let entry = entry_for(service)?;
        match entry.delete_password() {
            Ok(_) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(err) => Err(Error::Secret(err.to_string())),
        }
    }
}

fn entry_for(service: &str) -> Result<Entry> {
    let service_id = format_service_id(service);
    Entry::new(&service_id, USERNAME).map_err(|err| Error::Secret(err.to_string()))
}

pub fn shared_secret_store() -> Arc<dyn SecretStore> {
    Arc::new(KeyringSecretStore)
}
