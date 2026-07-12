use sha2::{Digest, Sha256};
use switcher_core::{Result, SwitcherError};

const PRIMARY_TARGET: &str = "gemini:antigravity";
const DISPLAY_TARGET: &str = "LegacyGeneric:target=gemini:antigravity";
const DPAPI_DESCRIPTION: &str = "Antigravity Account Switcher profile credential";

#[derive(Debug, Clone)]
pub struct ProtectedCredential(pub Vec<u8>);

#[derive(Debug, Clone, Default)]
pub struct CredentialStore;

impl CredentialStore {
    pub fn read_active(&self) -> Result<Vec<u8>> {
        #[cfg(windows)]
        {
            read_target(PRIMARY_TARGET).or_else(|_| read_target(DISPLAY_TARGET))
        }
        #[cfg(not(windows))]
        {
            Err(SwitcherError::UnsupportedPlatform)
        }
    }

    pub fn write_active(&self, bytes: &[u8]) -> Result<()> {
        #[cfg(windows)]
        {
            let target = if read_target(PRIMARY_TARGET).is_ok() {
                PRIMARY_TARGET
            } else if read_target(DISPLAY_TARGET).is_ok() {
                DISPLAY_TARGET
            } else {
                PRIMARY_TARGET
            };
            write_target(target, bytes)
        }
        #[cfg(not(windows))]
        {
            let _ = bytes;
            Err(SwitcherError::UnsupportedPlatform)
        }
    }

    pub fn protect(&self, bytes: &[u8]) -> Result<ProtectedCredential> {
        #[cfg(windows)]
        {
            protect_dpapi(bytes).map(ProtectedCredential)
        }
        #[cfg(not(windows))]
        {
            let _ = bytes;
            Err(SwitcherError::UnsupportedPlatform)
        }
    }

    pub fn unprotect(&self, protected: &ProtectedCredential) -> Result<Vec<u8>> {
        #[cfg(windows)]
        {
            unprotect_dpapi(&protected.0)
        }
        #[cfg(not(windows))]
        {
            let _ = protected;
            Err(SwitcherError::UnsupportedPlatform)
        }
    }

    pub fn digest(bytes: &[u8]) -> String {
        let digest = Sha256::digest(bytes);
        digest.iter().map(|byte| format!("{byte:02x}")).collect()
    }
}

#[cfg(windows)]
fn wide(value: &str) -> Vec<u16> {
    use std::os::windows::ffi::OsStrExt;
    std::ffi::OsStr::new(value)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect()
}

#[cfg(windows)]
fn read_target(target: &str) -> Result<Vec<u8>> {
    use std::{ptr, slice};
    use windows_sys::Win32::Security::Credentials::{
        CRED_TYPE_GENERIC, CREDENTIALW, CredFree, CredReadW,
    };
    let target = wide(target);
    let mut credential: *mut CREDENTIALW = ptr::null_mut();
    let ok = unsafe { CredReadW(target.as_ptr(), CRED_TYPE_GENERIC, 0, &mut credential) };
    if ok == 0 || credential.is_null() {
        return Err(SwitcherError::CredentialUnavailable);
    }
    let value = unsafe {
        let credential_ref = &*credential;
        let bytes = slice::from_raw_parts(
            credential_ref.CredentialBlob,
            credential_ref.CredentialBlobSize as usize,
        )
        .to_vec();
        CredFree(credential.cast());
        bytes
    };
    Ok(value)
}

#[cfg(windows)]
fn write_target(target: &str, bytes: &[u8]) -> Result<()> {
    use std::{mem::zeroed, ptr};
    use windows_sys::Win32::Security::Credentials::{
        CRED_PERSIST_LOCAL_MACHINE, CRED_TYPE_GENERIC, CREDENTIALW, CredWriteW,
    };
    let mut target = wide(target);
    let mut credential: CREDENTIALW = unsafe { zeroed() };
    credential.Type = CRED_TYPE_GENERIC;
    credential.TargetName = target.as_mut_ptr();
    credential.CredentialBlobSize = u32::try_from(bytes.len())
        .map_err(|_| SwitcherError::Windows("Poświadczenie jest zbyt duże".to_owned()))?;
    credential.CredentialBlob = bytes.as_ptr() as *mut u8;
    credential.Persist = CRED_PERSIST_LOCAL_MACHINE;
    credential.Attributes = ptr::null_mut();
    let ok = unsafe { CredWriteW(&credential, 0) };
    if ok == 0 {
        return Err(SwitcherError::Windows(format!(
            "CredWriteW zwrócił błąd {}",
            std::io::Error::last_os_error()
        )));
    }
    Ok(())
}

#[cfg(windows)]
fn protect_dpapi(bytes: &[u8]) -> Result<Vec<u8>> {
    use std::{ptr, slice};
    use windows_sys::Win32::{
        Foundation::LocalFree,
        Security::Cryptography::{CRYPT_INTEGER_BLOB, CRYPTPROTECT_UI_FORBIDDEN, CryptProtectData},
    };
    let mut input = CRYPT_INTEGER_BLOB {
        cbData: bytes.len() as u32,
        pbData: bytes.as_ptr() as *mut u8,
    };
    let mut output = CRYPT_INTEGER_BLOB {
        cbData: 0,
        pbData: ptr::null_mut(),
    };
    let description = wide(DPAPI_DESCRIPTION);
    let ok = unsafe {
        CryptProtectData(
            &mut input,
            description.as_ptr(),
            ptr::null(),
            ptr::null_mut(),
            ptr::null_mut(),
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut output,
        )
    };
    if ok == 0 {
        return Err(SwitcherError::Windows(format!(
            "CryptProtectData zwrócił błąd {}",
            std::io::Error::last_os_error()
        )));
    }
    let protected =
        unsafe { slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec() };
    unsafe { LocalFree(output.pbData as _) };
    Ok(protected)
}

#[cfg(windows)]
fn unprotect_dpapi(bytes: &[u8]) -> Result<Vec<u8>> {
    use std::{ptr, slice};
    use windows_sys::Win32::{
        Foundation::LocalFree,
        Security::Cryptography::{
            CRYPT_INTEGER_BLOB, CRYPTPROTECT_UI_FORBIDDEN, CryptUnprotectData,
        },
    };
    let mut input = CRYPT_INTEGER_BLOB {
        cbData: bytes.len() as u32,
        pbData: bytes.as_ptr() as *mut u8,
    };
    let mut output = CRYPT_INTEGER_BLOB {
        cbData: 0,
        pbData: ptr::null_mut(),
    };
    let mut description = ptr::null_mut();
    let ok = unsafe {
        CryptUnprotectData(
            &mut input,
            &mut description,
            ptr::null(),
            ptr::null_mut(),
            ptr::null_mut(),
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut output,
        )
    };
    if ok == 0 {
        return Err(SwitcherError::Windows(format!(
            "CryptUnprotectData zwrócił błąd {}",
            std::io::Error::last_os_error()
        )));
    }
    let value = unsafe { slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec() };
    unsafe {
        LocalFree(output.pbData as _);
        if !description.is_null() {
            LocalFree(description as _);
        }
    }
    Ok(value)
}
