use aes_gcm::aead::{Aead, KeyInit, OsRng, generic_array::GenericArray};
use aes_gcm::{Aes256Gcm, Nonce};
use aes_gcm::aead::rand_core::RngCore;
use diesel::backend::Backend;
use diesel::deserialize::{self, FromSql};
use diesel::serialize::{self, Output, ToSql};
use diesel::sql_types::Binary;
use diesel::{AsExpression, FromSqlRow};
use serde::{Deserialize, Serialize};
use anyhow::{Result, anyhow};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, AsExpression, FromSqlRow)]
#[diesel(sql_type = Binary)]
#[serde(transparent)]
pub struct EncryptedApiKey(pub String);

fn encrypt_api_key(api_key: &str, key: &[u8]) -> Result<Vec<u8>> {
    if key.len() != 32 {
        return Err(anyhow!("Encryption key must be exactly 32 bytes"));
    }

    let cipher = Aes256Gcm::new(GenericArray::from_slice(key));
    let mut nonce_bytes = [0u8; 12];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, api_key.as_bytes())
        .map_err(|e| anyhow!("Encryption failed: {}", e))?;

    let mut result = nonce_bytes.to_vec();
    result.extend(ciphertext);
    Ok(result)
}

fn decrypt_api_key(encrypted: &[u8], key: &[u8]) -> Result<String> {
    if key.len() != 32 {
        return Err(anyhow!("Encryption key must be exactly 32 bytes"));
    }
    if encrypted.len() < 12 {
        return Err(anyhow!("Invalid ciphertext: too short"));
    }

    let (nonce_bytes, ciphertext) = encrypted.split_at(12);
    let nonce = Nonce::from_slice(nonce_bytes);
    let cipher = Aes256Gcm::new(GenericArray::from_slice(key));

    let decrypted_bytes = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|e| anyhow!("Decryption failed: {}", e))?;

    Ok(String::from_utf8(decrypted_bytes)?)
}

impl<DB> ToSql<Binary, DB> for EncryptedApiKey
where
    DB: Backend,
    Vec<u8>: ToSql<Binary, DB>,
{
    fn to_sql<'a>(&'a self, out: &mut Output<'a, '_, DB>) -> serialize::Result {
        let key = std::env::var("ENCRYPTION_KEY")
            .expect("ENCRYPTION_KEY must be set");

        let encrypted = encrypt_api_key(&self.0, key.as_bytes())
            .map_err(|e| Box::<dyn std::error::Error + Send + Sync>::from(e))?;

        // Correct: leak the boxed slice, then convert it back to Vec
        let stable: &'a Vec<u8> = Box::leak(Box::new(encrypted));

        <Vec<u8> as ToSql<Binary, DB>>::to_sql(stable, out)
    }
}


impl<DB> FromSql<Binary, DB> for EncryptedApiKey
where
    DB: Backend,
    Vec<u8>: FromSql<Binary, DB>,
{
    fn from_sql(bytes: DB::RawValue<'_>) -> deserialize::Result<Self> {
        let encrypted: Vec<u8> = Vec::<u8>::from_sql(bytes)?;
        let key = std::env::var("ENCRYPTION_KEY")
            .expect("ENCRYPTION_KEY environment variable must be set");
        let decrypted = decrypt_api_key(&encrypted, key.as_bytes())
            .map_err(|e| Box::<dyn std::error::Error + Send + Sync>::from(e))?;
        Ok(EncryptedApiKey(decrypted))
    }
}
