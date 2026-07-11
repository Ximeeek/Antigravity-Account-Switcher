use std::path::PathBuf;

#[derive(Debug, thiserror::Error)]
pub enum SwitcherError {
    #[error("Operacja przełączania jest już w toku")]
    OperationInProgress,
    #[error("Profil docelowy jest już aktywny")]
    ProfileAlreadyActive,
    #[error("Nie znaleziono profilu {0}")]
    ProfileNotFound(String),
    #[error("Brak aktywnego profilu; najpierw zaimportuj bieżącą sesję")]
    NoActiveProfile,
    #[error("Wymagane jest odzyskiwanie poprzedniej operacji")]
    RecoveryRequired,
    #[error("Antigravity nadal działa i wymaga potwierdzenia zamknięcia")]
    ConfirmationRequired,
    #[error("Ścieżki nie znajdują się na tym samym woluminie: {left:?} i {right:?}")]
    CrossVolume { left: PathBuf, right: PathBuf },
    #[error("Brak wymaganych danych aktywnej sesji: {0:?}")]
    MissingActiveData(PathBuf),
    #[error("Cel operacji już istnieje: {0:?}")]
    DestinationExists(PathBuf),
    #[error("Nie udało się zamknąć procesów Antigravity: {0}")]
    ProcessShutdown(String),
    #[error("Pliki Antigravity są nadal zablokowane: {0:?}")]
    FilesLocked(PathBuf),
    #[error("Nie można odczytać poświadczeń Antigravity")]
    CredentialUnavailable,
    #[error("Nie udała się kontrola spójności: {0}")]
    Consistency(String),
    #[error("Nieobsługiwany system operacyjny; aplikacja działa wyłącznie w Windows")]
    UnsupportedPlatform,
    #[error("Nieprawidłowa konfiguracja: {0}")]
    InvalidConfiguration(String),
    #[error("Błąd wejścia/wyjścia dla {path:?}: {source}")]
    Io {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },
    #[error("Nieprawidłowe dane JSON w {path:?}: {source}")]
    Json {
        path: PathBuf,
        #[source]
        source: serde_json::Error,
    },
    #[error("Błąd systemu Windows: {0}")]
    Windows(String),
    #[error("{0}")]
    Message(String),
}

pub type Result<T> = std::result::Result<T, SwitcherError>;

impl SwitcherError {
    pub fn io(path: impl Into<PathBuf>, source: std::io::Error) -> Self {
        Self::Io {
            path: path.into(),
            source,
        }
    }
}

