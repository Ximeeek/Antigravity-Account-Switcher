use crate::{Result, SwitcherError};
use aes_gcm::{
    Aes256Gcm, Key, Nonce,
    aead::{Aead, KeyInit},
};
use pbkdf2::pbkdf2_hmac;
use rand_core::{OsRng, RngCore};
use sha2::Sha256;

const PBKDF2_ITERATIONS: u32 = 100_000;

pub fn generate_salt() -> [u8; 16] {
    let mut salt = [0u8; 16];
    OsRng.fill_bytes(&mut salt);
    salt
}

pub fn derive_key(password: &str, salt: &[u8]) -> [u8; 32] {
    let mut key = [0u8; 32];
    pbkdf2_hmac::<Sha256>(password.as_bytes(), salt, PBKDF2_ITERATIONS, &mut key);
    key
}

pub fn encrypt_bytes(data: &[u8], password: &str, salt: &[u8]) -> Result<Vec<u8>> {
    let derived_key = derive_key(password, salt);
    encrypt_with_key(data, &derived_key)
}

pub fn decrypt_bytes(encrypted_data: &[u8], password: &str, salt: &[u8]) -> Result<Vec<u8>> {
    let derived_key = derive_key(password, salt);
    decrypt_with_key(encrypted_data, &derived_key)
}

pub fn encrypt_with_key(data: &[u8], derived_key: &[u8; 32]) -> Result<Vec<u8>> {
    let key = Key::<Aes256Gcm>::from_slice(derived_key);
    let cipher = Aes256Gcm::new(key);

    let mut nonce_bytes = [0u8; 12];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, data)
        .map_err(|e| SwitcherError::Message(format!("Encryption error: {:?}", e)))?;

    let mut result = nonce_bytes.to_vec();
    result.extend_from_slice(&ciphertext);
    Ok(result)
}

pub fn decrypt_with_key(encrypted_data: &[u8], derived_key: &[u8; 32]) -> Result<Vec<u8>> {
    if encrypted_data.len() < 12 {
        return Err(SwitcherError::DecryptionFailed);
    }
    let (nonce_bytes, ciphertext) = encrypted_data.split_at(12);

    let key = Key::<Aes256Gcm>::from_slice(derived_key);
    let cipher = Aes256Gcm::new(key);
    let nonce = Nonce::from_slice(nonce_bytes);

    let plaintext = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|_| SwitcherError::DecryptionFailed)?;

    Ok(plaintext)
}
