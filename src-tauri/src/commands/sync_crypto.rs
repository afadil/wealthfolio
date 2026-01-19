//! Sync Crypto Commands
//!
//! Tauri command wrappers for E2EE cryptographic operations.
//! Delegates to the shared crypto module in wealthfolio-device-sync.

use wealthfolio_device_sync::crypto::{self, EphemeralKeyPair};

#[tauri::command]
pub fn sync_generate_root_key() -> String {
    crypto::generate_root_key()
}

#[tauri::command]
pub fn sync_derive_dek(root_key: String, version: u32) -> Result<String, String> {
    crypto::derive_dek(&root_key, version)
}

#[tauri::command]
pub fn sync_generate_keypair() -> EphemeralKeyPair {
    crypto::generate_ephemeral_keypair()
}

#[tauri::command]
pub fn sync_compute_shared_secret(
    our_secret: String,
    their_public: String,
) -> Result<String, String> {
    crypto::compute_shared_secret(&our_secret, &their_public)
}

#[tauri::command]
pub fn sync_derive_session_key(shared_secret: String, context: String) -> Result<String, String> {
    crypto::derive_session_key(&shared_secret, &context)
}

#[tauri::command]
pub fn sync_encrypt(key: String, plaintext: String) -> Result<String, String> {
    crypto::encrypt(&key, &plaintext)
}

#[tauri::command]
pub fn sync_decrypt(key: String, ciphertext: String) -> Result<String, String> {
    crypto::decrypt(&key, &ciphertext)
}

#[tauri::command]
pub fn sync_generate_pairing_code() -> String {
    crypto::generate_pairing_code()
}

#[tauri::command]
pub fn sync_hash_pairing_code(code: String) -> String {
    crypto::hash_pairing_code(&code)
}

#[tauri::command]
pub fn sync_compute_sas(shared_secret: String) -> Result<String, String> {
    crypto::compute_sas(&shared_secret)
}

#[tauri::command]
pub fn sync_generate_device_id() -> String {
    crypto::generate_device_id()
}
