use std::{collections::HashMap, fs, path::PathBuf, sync::Mutex};

use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use chacha20poly1305::{
    aead::{Aead, KeyInit},
    ChaCha20Poly1305, Key, Nonce,
};
use rand::{rngs::OsRng, RngCore};
use serde::{Deserialize, Serialize};

use wealthfolio_core::{
    errors::Error,
    secrets::{format_service_id, SecretStore},
    Result,
};

const CURRENT_VERSION: u32 = 1;

#[derive(Debug)]
pub struct FileSecretStore {
    path: PathBuf,
    encryption_key: Option<[u8; 32]>,
    lock: Mutex<()>,
}

#[derive(Serialize, Deserialize, Default)]
struct PlainSecrets {
    version: u32,
    secrets: HashMap<String, String>,
}

#[derive(Serialize, Deserialize)]
struct EncryptedSecrets {
    version: u32,
    nonce: String,
    ciphertext: String,
}

impl FileSecretStore {
    pub fn new(path: PathBuf, encryption_key: Option<&str>) -> Result<Self> {
        let key = match encryption_key {
            Some(value) if !value.trim().is_empty() => Some(decode_encryption_key(value)?),
            _ => None,
        };

        Ok(Self {
            path,
            encryption_key: key,
            lock: Mutex::new(()),
        })
    }

    fn with_store<F>(&self, mut op: F) -> Result<()>
    where
        F: FnMut(&mut HashMap<String, String>) -> Result<()>,
    {
        let _guard = self
            .lock
            .lock()
            .map_err(|_| Error::Secret("Secret store lock poisoned".into()))?;
        let mut store = self.load_store_locked()?;
        op(&mut store)?;
        self.persist_store_locked(&store)
    }

    fn read_store(&self) -> Result<HashMap<String, String>> {
        let _guard = self
            .lock
            .lock()
            .map_err(|_| Error::Secret("Secret store lock poisoned".into()))?;
        self.load_store_locked()
    }

    #[allow(deprecated)]
    fn load_store_locked(&self) -> Result<HashMap<String, String>> {
        if !self.path.exists() {
            return Ok(HashMap::new());
        }

        let raw = fs::read(&self.path)?;
        if raw.is_empty() {
            return Ok(HashMap::new());
        }

        let value: serde_json::Value = serde_json::from_slice(&raw)?;

        if value.get("ciphertext").is_some() {
            let key = self.encryption_key.ok_or_else(|| {
                Error::Secret("WF_SECRET_KEY must be set to decrypt the secrets file".into())
            })?;
            let enc: EncryptedSecrets = serde_json::from_value(value)?;
            let nonce_bytes = BASE64
                .decode(enc.nonce)
                .map_err(|e| Error::Secret(format!("Failed to decode nonce: {e}")))?;
            let cipher_bytes = BASE64
                .decode(enc.ciphertext)
                .map_err(|e| Error::Secret(format!("Failed to decode ciphertext: {e}")))?;

            let cipher = ChaCha20Poly1305::new(Key::from_slice(&key));
            let nonce = Nonce::from_slice(&nonce_bytes);
            let plaintext = cipher
                .decrypt(nonce, cipher_bytes.as_ref())
                .map_err(|_| Error::Secret("Failed to decrypt secrets file".into()))?;
            let plain: PlainSecrets = serde_json::from_slice(&plaintext)?;
            Ok(plain.secrets)
        } else {
            let plain: PlainSecrets = serde_json::from_value(value)?;
            Ok(plain.secrets)
        }
    }

    #[allow(deprecated)]
    fn persist_store_locked(&self, store: &HashMap<String, String>) -> Result<()> {
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent)?;
        }

        let plain = PlainSecrets {
            version: CURRENT_VERSION,
            secrets: store.clone(),
        };

        if let Some(key) = self.encryption_key {
            let serialized = serde_json::to_vec(&plain)?;
            let mut nonce_bytes = [0u8; 12];
            OsRng.fill_bytes(&mut nonce_bytes);
            let cipher = ChaCha20Poly1305::new(Key::from_slice(&key));
            let nonce = Nonce::from_slice(&nonce_bytes);
            let ciphertext = cipher
                .encrypt(nonce, serialized.as_ref())
                .map_err(|_| Error::Secret("Failed to encrypt secrets".into()))?;
            let enc = EncryptedSecrets {
                version: CURRENT_VERSION,
                nonce: BASE64.encode(nonce_bytes),
                ciphertext: BASE64.encode(ciphertext),
            };
            let json = serde_json::to_string_pretty(&enc)?;
            fs::write(&self.path, json)?;
        } else {
            let json = serde_json::to_string_pretty(&plain)?;
            fs::write(&self.path, json)?;
        }
        Ok(())
    }
}

impl SecretStore for FileSecretStore {
    fn set_secret(&self, service: &str, secret: &str) -> Result<()> {
        let key = format_service_id(service);
        self.with_store(|store| {
            store.insert(key.clone(), secret.to_string());
            Ok(())
        })
    }

    fn get_secret(&self, service: &str) -> Result<Option<String>> {
        let key = format_service_id(service);
        let store = self.read_store()?;
        Ok(store.get(&key).cloned())
    }

    fn delete_secret(&self, service: &str) -> Result<()> {
        let key = format_service_id(service);
        self.with_store(|store| {
            store.remove(&key);
            Ok(())
        })
    }
}

pub fn build_secret_store(path: PathBuf, encryption_key: Option<&str>) -> Result<FileSecretStore> {
    FileSecretStore::new(path, encryption_key)
}

fn decode_encryption_key(raw: &str) -> Result<[u8; 32]> {
    let trimmed = raw.trim();
    let decoded = match BASE64.decode(trimmed) {
        Ok(bytes) => bytes,
        Err(_) if trimmed.len() == 32 => trimmed.as_bytes().to_vec(),
        Err(_) => {
            return Err(Error::Secret(
                "WF_SECRET_KEY must be a base64 string or 32-byte ascii value".into(),
            ))
        }
    };

    if decoded.len() != 32 {
        return Err(Error::Secret(
            "WF_SECRET_KEY must decode to exactly 32 bytes".into(),
        ));
    }

    let mut key = [0u8; 32];
    key.copy_from_slice(&decoded);
    Ok(key)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn round_trip_without_encryption() {
        let dir = tempdir().unwrap();
        let file = dir.path().join("secrets.json");
        let store = FileSecretStore::new(file.clone(), None).unwrap();

        store.set_secret("alpha", "value").unwrap();
        assert_eq!(store.get_secret("alpha").unwrap().as_deref(), Some("value"));

        store.delete_secret("alpha").unwrap();
        assert!(store.get_secret("alpha").unwrap().is_none());
        assert!(file.exists());
    }

    #[test]
    fn round_trip_with_encryption() {
        let dir = tempdir().unwrap();
        let file = dir.path().join("secrets.json");
        let key = BASE64.encode([7u8; 32]);
        let store = FileSecretStore::new(file.clone(), Some(&key)).unwrap();

        store.set_secret("beta", "secret").unwrap();
        assert_eq!(store.get_secret("beta").unwrap().as_deref(), Some("secret"));
        assert!(file.exists());

        let raw = fs::read_to_string(file).unwrap();
        assert!(raw.contains("ciphertext"));
    }
}
