#![cfg(feature = "wealthfolio-pro")]

use std::sync::Arc;

use crate::secret_store::KeyringSecretStore;
use anyhow::Result;
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use log::warn;
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use wealthfolio_core::secrets::SecretStore;
use wealthfolio_core::sync::transport;

const SYNC_IDENTITY_SECRET_KEY: &str = "sync_identity";
const LEGACY_DEVICE_ID_SECRET_KEY: &str = "device_id";

#[derive(Debug, Serialize, Deserialize)]
struct StoredSyncIdentity {
    device_id: String,
    certificate: String,
    private_key: String,
}

pub fn get_or_create_sync_identity() -> Result<(Uuid, Arc<transport::Identity>)> {
    let store = KeyringSecretStore::default();

    if let Some(raw) = store.get_secret(SYNC_IDENTITY_SECRET_KEY)? {
        if let Some(restored) = restore_identity_from_secret(&raw) {
            return Ok(restored);
        }
        warn!("stored sync identity is invalid; generating a new one");
    }

    let legacy_device_id = store
        .get_secret(LEGACY_DEVICE_ID_SECRET_KEY)?
        .and_then(|value| Uuid::parse_str(&value).ok());

    let device_id = legacy_device_id.unwrap_or_else(Uuid::new_v4);
    let identity = transport::Identity::generate_for_device(device_id)?;
    persist_identity(&device_id, &identity)?;

    if legacy_device_id.is_some() {
        let _ = store.delete_secret(LEGACY_DEVICE_ID_SECRET_KEY);
    }

    Ok((device_id, Arc::new(identity)))
}

fn restore_identity_from_secret(raw: &str) -> Option<(Uuid, Arc<transport::Identity>)> {
    let stored: StoredSyncIdentity = serde_json::from_str(raw).ok()?;
    let device_id = Uuid::parse_str(&stored.device_id).ok()?;
    let certificate = BASE64.decode(stored.certificate.as_bytes()).ok()?;
    let private_key = BASE64.decode(stored.private_key.as_bytes()).ok()?;
    let identity = transport::Identity::from_der(certificate, private_key).ok()?;
    Some((device_id, Arc::new(identity)))
}

fn persist_identity(device_id: &Uuid, identity: &transport::Identity) -> Result<()> {
    let payload = StoredSyncIdentity {
        device_id: device_id.to_string(),
        certificate: BASE64.encode(identity.certificate_der()),
        private_key: BASE64.encode(identity.private_key_der()),
    };
    let serialized = serde_json::to_string(&payload)?;
    KeyringSecretStore::default().set_secret(SYNC_IDENTITY_SECRET_KEY, &serialized)?;
    Ok(())
}
