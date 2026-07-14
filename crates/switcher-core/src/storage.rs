use crate::{Result, SwitcherError};
use serde::{Serialize, de::DeserializeOwned};
use std::{fs, io::Write, path::Path};

pub fn load_json<T: DeserializeOwned>(path: &Path) -> Result<T> {
    let bytes = fs::read(path).map_err(|source| SwitcherError::io(path, source))?;
    serde_json::from_slice(&bytes).map_err(|source| SwitcherError::Json {
        path: path.to_path_buf(),
        source,
    })
}

pub fn save_json<T: Serialize>(path: &Path, value: &T) -> Result<()> {
    let bytes = serde_json::to_vec_pretty(value).map_err(|source| SwitcherError::Json {
        path: path.to_path_buf(),
        source,
    })?;
    atomic_write(path, &bytes)
}

pub fn atomic_write(path: &Path, bytes: &[u8]) -> Result<()> {
    let parent = path.parent().ok_or_else(|| {
        SwitcherError::InvalidConfiguration(format!("Path without parent directory: {path:?}"))
    })?;
    fs::create_dir_all(parent).map_err(|source| SwitcherError::io(parent, source))?;
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("switcher-data");
    let temp = parent.join(format!(".{file_name}.{}.tmp", uuid::Uuid::new_v4()));

    let mut handle = fs::OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(&temp)
        .map_err(|source| SwitcherError::io(&temp, source))?;
    handle
        .write_all(bytes)
        .and_then(|_| handle.sync_all())
        .map_err(|source| SwitcherError::io(&temp, source))?;
    drop(handle);

    replace_file(&temp, path).inspect_err(|_| {
        let _ = fs::remove_file(&temp);
    })?;

    if let Ok(directory) = fs::File::open(parent) {
        let _ = directory.sync_all();
    }
    Ok(())
}

#[cfg(windows)]
fn replace_file(source: &Path, destination: &Path) -> Result<()> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::{
        MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH, MoveFileExW,
    };

    let mut source_wide: Vec<u16> = source.as_os_str().encode_wide().collect();
    source_wide.push(0);
    let mut destination_wide: Vec<u16> = destination.as_os_str().encode_wide().collect();
    destination_wide.push(0);
    let ok = unsafe {
        MoveFileExW(
            source_wide.as_ptr(),
            destination_wide.as_ptr(),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    };
    if ok == 0 {
        return Err(SwitcherError::io(
            destination,
            std::io::Error::last_os_error(),
        ));
    }
    Ok(())
}

#[cfg(not(windows))]
fn replace_file(source: &Path, destination: &Path) -> Result<()> {
    fs::rename(source, destination)
        .map_err(|source_error| SwitcherError::io(destination, source_error))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn atomic_write_replaces_existing_file() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("value.json");
        atomic_write(&path, b"first").unwrap();
        atomic_write(&path, b"second").unwrap();
        assert_eq!(std::fs::read(path).unwrap(), b"second");
    }
}
