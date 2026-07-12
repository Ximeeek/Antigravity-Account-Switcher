export type Language = "pl" | "en";

let currentLanguage: Language = "pl";

// Detect initial language from localStorage or browser preferences
if (typeof window !== "undefined") {
  const saved = localStorage.getItem("app_lang") as Language;
  if (saved === "pl" || saved === "en") {
    currentLanguage = saved;
  } else {
    currentLanguage = navigator.language?.toLowerCase().startsWith("pl") ? "pl" : "en";
  }
}

export const getLanguage = (): Language => currentLanguage;

export const setLanguage = (lang: Language) => {
  currentLanguage = lang;
  if (typeof window !== "undefined") {
    localStorage.setItem("app_lang", lang);
  }
};

export const translations = {
  pl: {
    // App / General
    unexpected_error: "Wystąpił nieoczekiwany błąd. Spróbuj ponownie.",
    loading_profiles: "Ładowanie profili",
    checking_status: "Sprawdzamy stan Antigravity i lokalnego magazynu.",
    app_load_failed: "Nie udało się uruchomić aplikacji",
    try_again: "Spróbuj ponownie",
    settings_saved: "Ustawienia zostały zapisane.",
    diagnostics_copied: "Dziennik diagnostyczny skopiowano do schowka.",
    recovery_completed: "Odzyskiwanie zostało zakończone.",
    rollback_completed: "Poprzedni profil został przywrócony.",
    app_requires_attention: "Aplikacja wymaga uwagi",
    refresh: "Odśwież",
    refresh_app_state: "Odśwież stan aplikacji",
    close_message: "Zamknij komunikat",
    no_data: "Brak danych",
    selected_account: "wybrane konto",

    // TitleBar
    titlebar_title: "Antigravity Account Switcher",
    minimize: "Minimalizuj",
    maximize: "Maksymalizuj",
    close: "Zamknij",

    // Header
    brand_name: "Account Manager",
    brand_product: "Account Switcher",
    nav_accounts: "Konta",
    nav_settings: "Ustawienia",
    engine_ready: "Gotowy",
    engine_busy: "Operacja w toku",
    engine_error: "Wymaga uwagi",
    engine_offline: "Niedostępny",
    brand_title_attr: "Przejdź do panelu głównego",
    demo_accounts: "Demo: konta",
    demo_empty: "Demo: pusty stan",
    demo_progress: "Demo: postęp",
    demo_recovery: "Demo: recovery",
    demo_error: "Demo: błąd",

    // Token Status Labels (utils.ts)
    token_valid: "Token ważny",
    token_expiring: "Wygasa wkrótce",
    token_expired: "Wymaga logowania",
    token_refreshing: "Odświeżanie",
    token_unknown: "Status nieznany",
    token_auto_refresh: "Autoodświeżanie",
    token_auto_refresh_desc: "Ważny (odświeżany automatycznie)",
    token_relogin_needed: "Zaloguj konto ponownie w Antigravity",
    token_no_expiry_info: "Brak informacji o wygaśnięciu",
    token_expired_detail: "Token wygasł",
    token_expiring_in: "Wygasa za {minutes} min",
    token_refreshing_secure: "Bezpieczne odświeżanie tokenu",
    token_valid_until: "Ważny do {time}",

    // Switch steps labels (utils.ts / SwitchFlow.tsx)
    step_preparing: "Przygotowywanie operacji",
    step_closing: "Zamykanie Antigravity",
    step_saving: "Zapisywanie obecnego profilu",
    step_loading: "Ładowanie i sprawdzanie nowego profilu",
    step_finishing: "Kończenie i uruchamianie Antigravity",

    // Dashboard
    active_account: "Aktywne konto",
    active: "Aktywne",
    email_hidden: "Adres e-mail jest ukryty",
    fact_auth: "Uwierzytelnianie",
    quota_usage_title: "Limity użycia modeli Gemini",
    quota_weekly_limit: "Limit tygodniowy",
    quota_5h_limit: "Limit 5-godzinny",
    quota_remaining: "Pozostało: {pct}%",
    quota_refresh_in: "Odświeżenie za: {time}",
    quota_full: "W pełni odświeżony",
    fact_last_active: "Ostatnia aktywacja",
    fact_context_kept: "Kontekst profilu jest zachowany",
    no_active_account: "Nie wykryto aktywnego konta",
    no_active_account_desc: "Wybierz jeden z zapisanych profili, aby ustawić go jako aktywny.",
    empty_eyebrow: "Pierwszy krok",
    empty_title: "Dodaj swoje pierwsze konto",
    empty_desc: "Zapisz aktualnie zalogowany profil Antigravity, aby później przełączać konto bez utraty historii i ustawień.",
    empty_button: "Dodaj bieżące konto",
    empty_hint: "Dane profilu pozostają lokalnie na tym komputerze.",
    section_eyebrow: "Profile lokalne",
    section_title_other: "Pozostałe konta",
    section_title_saved: "Zapisane konta",
    section_desc_empty: "Brak innych zapisanych profili",
    section_desc_one: "1 profil gotowy do przełączenia",
    section_desc_many: "{count} profile gotowe do przełączenia",
    section_desc_many_generic: "{count} profili gotowych do przełączenia",
    add_account: "Dodaj konto",
    import_current: "Importuj bieżący profil Antigravity",
    card_delete_aria: "Usuń konto {name}",
    card_delete_title: "Usuń konto",
    card_last_used: "Ostatnio używane: {date}",
    card_activate: "Aktywuj",

    // Settings
    settings_eyebrow: "Konfiguracja lokalna",
    settings_title: "Ustawienia",
    settings_desc: "Zarządzaj połączeniem, wtyczką i bezpieczną diagnostyką.",
    settings_switcher_ver: "Switcher {version}",
    versions: "Wersje aplikacji",
    settings_antigravity_ver: "Antigravity {version}",
    server_title: "Serwer lokalny",
    server_desc: "Połączenie wtyczki z aplikacją desktopową.",
    port_label: "Port HTTP",
    port_hint: "Dostępny wyłącznie lokalnie. Zmiana może wymagać ponownego połączenia wtyczki.",
    path_label: "Ścieżka instalacji Antigravity",
    validation_port: "Port musi być liczbą od 1024 do 65535.",
    validation_path: "Podaj ścieżkę do pliku Antigravity.exe.",
    unsaved_changes: "Masz niezapisane zmiany",
    settings_up_to_date: "Ustawienia są aktualne",
    saving: "Zapisywanie…",
    save_changes: "Zapisz zmiany",

    diagnostics_title: "Diagnostyka",
    diagnostics_desc: "Gotowy, zanonimizowany raport do zgłoszenia problemu.",
    diagnostics_item1: "Ostatnie zdarzenia i wersje aplikacji",
    diagnostics_item2: "Wykryte ścieżki bez sekretów",
    diagnostics_item3: "Tokeny i adresy e-mail są pomijane",
    diagnostics_copying: "Kopiowanie…",
    diagnostics_copy: "Kopiuj dziennik diagnostyczny",
    privacy_title: "Prywatność profili",
    privacy_desc: "Dane kont pozostają na tym komputerze.",
    privacy_note: "Profile są identyfikowane losowym UUID. Dane uwierzytelniające nie trafiają do logów.",
    language_label: "Język aplikacji",

    // Modals
    add_modal_eyebrow: "Dodawanie profilu",
    add_modal_cancel: "Anuluj",
    add_modal_submit: "Zaloguj się przez Google",
    add_modal_submitting: "Logowanie…",
    add_modal_title: "Dodaj nowe konto Google",
    add_modal_desc: "Utwórz nowy profil, logując się bezpośrednio przez Google OAuth w przeglądarce.",
    add_modal_waiting: "Oczekiwanie na logowanie...",
    add_modal_waiting_desc: "W otwartym oknie przeglądarki zaloguj się na swoje konto Google. Kliknij „Anuluj”, aby przerwać.",
    add_modal_redirect: "Po zatwierdzeniu otworzy się przeglądarka systemowa z oficjalną stroną logowania Google.",
    add_modal_name_label: "Nazwa wyświetlana konta",
    add_modal_name_placeholder: "np. Praca, Studio, Prywatne",
    add_modal_name_hint: "Nazwa widoczna tylko lokalnie w Switcherze i wtyczce.",
    add_modal_validation_len: "Nazwa konta powinna mieć co najmniej 2 znaki.",

    delete_modal_title: "Usunąć zapisane konto?",
    delete_modal_desc: "Profil „{name}” i jego lokalna historia zostaną trwale usunięte.",
    delete_modal_cancel: "Anuluj",
    delete_modal_confirm: "Usuń profil",
    delete_modal_confirming: "Usuwanie…",
    delete_modal_warning: "Tej operacji nie można cofnąć. Aktywnego profilu nie da się usunąć.",

    // Switch Confirmation
    confirm_modal_eyebrow: "Potwierdzenie przełączenia",
    confirm_modal_cancel: "Anuluj",
    confirm_modal_confirm: "Kontynuuj",
    confirm_modal_confirming: "Uruchamianie…",
    confirm_modal_title: "Antigravity zostanie zamknięty",
    confirm_modal_desc: "Do bezpiecznego przełączenia profilu konieczne jest ponowne uruchomienie edytora.",
    confirm_modal_current: "Obecnie",
    confirm_modal_target: "Po przełączeniu",
    confirm_modal_warning: "Upewnij się, że wszystkie pliki w Antigravity są zapisane. Niezapisane zmiany mogą zostać utracone.",

    // Switch Progress
    progress_modal_eyebrow: "Bezpieczna zmiana profilu",
    progress_modal_title: "Przełączanie na „{name}”",
    progress_modal_desc: "Zachowujemy dane obecnego konta i sprawdzamy spójność nowego profilu.",
    progress_modal_caution: "Nie zamykaj aplikacji podczas przełączania.",
    progress_modal_technical: "Szczegóły techniczne",
    progress_modal_op_id: "Identyfikator operacji",
    progress_modal_step: "Krok systemowy",

    // Recovery Screen
    recovery_title_brand: "Account Manager Account Switcher",
    recovery_required: "Odzyskiwanie wymagane",
    recovery_title: "Poprzednie przełączanie nie zostało dokończone",
    recovery_desc: "Operacja została przerwana na etapie: {step}. Wybierz bezpieczny sposób kontynuacji, zanim wrócisz do aplikacji.",
    recovery_prev_profile: "Poprzedni profil",
    recovery_target_profile: "Profil docelowy",
    recovery_resume: "Spróbuj dokończyć",
    recovery_resume_desc: "Kontynuuj od bezpiecznego zapisanego etapu.",
    recovery_resuming: "Wznawianie…",
    recovery_rollback: "Przywróć poprzedni stan",
    recovery_rollback_desc: "Wycofaj operację i ponownie aktywuj „{name}”.",
    recovery_rolling_back: "Przywracanie…",
    recovery_technical: "Pokaż szczegóły operacji",
    recovery_op_id: "Id operacji",
    recovery_step: "Krok techniczny",
    recovery_copy: "Kopiuj diagnostykę",
    recovery_copying: "Kopiowanie…",
    recovery_security: "Normalny dostęp pozostaje zablokowany, aby chronić dane profili."
  },
  en: {
    // App / General
    unexpected_error: "An unexpected error occurred. Please try again.",
    loading_profiles: "Loading profiles",
    checking_status: "Checking Antigravity and local storage status.",
    app_load_failed: "Failed to start the application",
    try_again: "Try again",
    settings_saved: "Settings have been saved.",
    diagnostics_copied: "Diagnostic log copied to clipboard.",
    recovery_completed: "Recovery completed.",
    rollback_completed: "Previous profile restored.",
    app_requires_attention: "Application requires attention",
    refresh: "Refresh",
    refresh_app_state: "Refresh application status",
    close_message: "Close message",
    no_data: "No data",
    selected_account: "selected account",

    // TitleBar
    titlebar_title: "Antigravity Account Switcher",
    minimize: "Minimize",
    maximize: "Maximize",
    close: "Close",

    // Header
    brand_name: "Account Manager",
    brand_product: "Account Switcher",
    nav_accounts: "Accounts",
    nav_settings: "Settings",
    engine_ready: "Ready",
    engine_busy: "Operation in progress",
    engine_error: "Requires attention",
    engine_offline: "Offline",
    brand_title_attr: "Go to main dashboard",
    demo_accounts: "Demo: accounts",
    demo_empty: "Demo: empty state",
    demo_progress: "Demo: progress",
    demo_recovery: "Demo: recovery",
    demo_error: "Demo: error",

    // Token Status Labels (utils.ts)
    token_valid: "Token valid",
    token_expiring: "Expiring soon",
    token_expired: "Requires login",
    token_refreshing: "Refreshing",
    token_unknown: "Unknown status",
    token_auto_refresh: "Auto-refresh",
    token_auto_refresh_desc: "Valid (auto-refreshed)",
    token_relogin_needed: "Log in to account again in Antigravity",
    token_no_expiry_info: "No expiration info available",
    token_expired_detail: "Token expired",
    token_expiring_in: "Expires in {minutes} min",
    token_refreshing_secure: "Secure token refresh",
    token_valid_until: "Valid until {time}",

    // Switch steps labels (utils.ts / SwitchFlow.tsx)
    step_preparing: "Preparing operation",
    step_closing: "Closing Antigravity",
    step_saving: "Saving current profile",
    step_loading: "Loading and verifying new profile",
    step_finishing: "Finishing and starting Antigravity",

    // Dashboard
    active_account: "Active account",
    active: "Active",
    email_hidden: "Email address is hidden",
    fact_auth: "Authentication",
    quota_usage_title: "Gemini Model Usage Limits",
    quota_weekly_limit: "Weekly Limit",
    quota_5h_limit: "Five Hour Limit",
    quota_remaining: "Remaining: {pct}%",
    quota_refresh_in: "Refreshes in: {time}",
    quota_full: "Fully refreshed",
    fact_last_active: "Last activated",
    fact_context_kept: "Profile context is preserved",
    no_active_account: "No active account detected",
    no_active_account_desc: "Select one of the saved profiles to set it as active.",
    empty_eyebrow: "First step",
    empty_title: "Add your first account",
    empty_desc: "Save the currently logged-in Antigravity profile to switch accounts later without losing history and settings.",
    empty_button: "Add current account",
    empty_hint: "Profile data remains locally on this computer.",
    section_eyebrow: "Local profiles",
    section_title_other: "Other accounts",
    section_title_saved: "Saved accounts",
    section_desc_empty: "No other saved profiles",
    section_desc_one: "1 profile ready to switch",
    section_desc_many: "{count} profiles ready to switch",
    section_desc_many_generic: "{count} profiles ready to switch",
    add_account: "Add account",
    import_current: "Import current Antigravity profile",
    card_delete_aria: "Delete account {name}",
    card_delete_title: "Delete account",
    card_last_used: "Last used: {date}",
    card_activate: "Activate",

    // Settings
    settings_eyebrow: "Local configuration",
    settings_title: "Settings",
    settings_desc: "Manage connection, plugin, and secure diagnostics.",
    settings_switcher_ver: "Switcher {version}",
    versions: "Application versions",
    settings_antigravity_ver: "Antigravity {version}",
    server_title: "Local server",
    server_desc: "Connection of the plugin with the desktop app.",
    port_label: "HTTP Port",
    port_hint: "Available locally only. Changing it may require reconnecting the plugin.",
    path_label: "Antigravity installation path",
    validation_port: "Port must be a number between 1024 and 65535.",
    validation_path: "Provide the path to Antigravity.exe.",
    unsaved_changes: "You have unsaved changes",
    settings_up_to_date: "Settings are up to date",
    saving: "Saving…",
    save_changes: "Save changes",

    diagnostics_title: "Diagnostics",
    diagnostics_desc: "Ready, anonymized report for reporting issues.",
    diagnostics_item1: "Recent events and application versions",
    diagnostics_item2: "Detected paths without secrets",
    diagnostics_item3: "Tokens and email addresses are omitted",
    diagnostics_copying: "Copying…",
    diagnostics_copy: "Copy diagnostic log",
    privacy_title: "Profile privacy",
    privacy_desc: "Account data remains on this computer.",
    privacy_note: "Profiles are identified by a random UUID. Credentials do not enter the logs.",
    language_label: "App language",

    // Modals
    add_modal_eyebrow: "Add profile",
    add_modal_cancel: "Cancel",
    add_modal_submit: "Sign in with Google",
    add_modal_submitting: "Signing in…",
    add_modal_title: "Add new Google account",
    add_modal_desc: "Create a new profile by logging in directly via Google OAuth in the browser.",
    add_modal_waiting: "Waiting for login...",
    add_modal_waiting_desc: "Sign in to your Google account in the opened browser window. Click \"Cancel\" to abort.",
    add_modal_redirect: "Upon confirmation, your system browser will open the official Google login page.",
    add_modal_name_label: "Account display name",
    add_modal_name_placeholder: "e.g. Work, Studio, Private",
    add_modal_name_hint: "Name visible only locally in the Switcher and plugin.",
    add_modal_validation_len: "Account name should be at least 2 characters long.",

    delete_modal_title: "Delete saved account?",
    delete_modal_desc: "Profile \"{name}\" and its local history will be permanently deleted.",
    delete_modal_cancel: "Cancel",
    delete_modal_confirm: "Delete profile",
    delete_modal_confirming: "Deleting…",
    delete_modal_warning: "This operation cannot be undone. The active profile cannot be deleted.",

    // Switch Confirmation
    confirm_modal_eyebrow: "Confirm switch",
    confirm_modal_cancel: "Cancel",
    confirm_modal_confirm: "Continue",
    confirm_modal_confirming: "Starting…",
    confirm_modal_title: "Antigravity will be closed",
    confirm_modal_desc: "Restarting the editor is required to switch the profile safely.",
    confirm_modal_current: "Currently",
    confirm_modal_target: "After switch",
    confirm_modal_warning: "Make sure all files in Antigravity are saved. Unsaved changes may be lost.",

    // Switch Progress
    progress_modal_eyebrow: "Safe profile switch",
    progress_modal_title: "Switching to \"{name}\"",
    progress_modal_desc: "Preserving current account data and checking the new profile consistency.",
    progress_modal_caution: "Do not close the application while switching.",
    progress_modal_technical: "Technical details",
    progress_modal_op_id: "Operation ID",
    progress_modal_step: "System step",

    // Recovery Screen
    recovery_title_brand: "Account Manager Account Switcher",
    recovery_required: "Recovery required",
    recovery_title: "Previous switch was not completed",
    recovery_desc: "The operation was interrupted at step: {step}. Choose a safe way to continue before returning to the app.",
    recovery_prev_profile: "Previous profile",
    recovery_target_profile: "Target profile",
    recovery_resume: "Try to complete",
    recovery_resume_desc: "Continue from a safe saved stage.",
    recovery_resuming: "Resuming…",
    recovery_rollback: "Restore previous state",
    recovery_rollback_desc: "Roll back the operation and reactivate \"{name}\".",
    recovery_rolling_back: "Restoring…",
    recovery_technical: "Show operation details",
    recovery_op_id: "Operation ID",
    recovery_step: "Technical step",
    recovery_copy: "Copy diagnostics",
    recovery_copying: "Copying…",
    recovery_security: "Normal access remains blocked to protect profile data."
  }
};

export type TranslationKey = keyof typeof translations.pl;

export const t = (key: TranslationKey, variables?: Record<string, string>): string => {
  const lang = getLanguage();
  let text = translations[lang][key] || translations["pl"][key] || key;
  if (variables) {
    Object.entries(variables).forEach(([name, val]) => {
      text = text.replace(`{${name}}`, val);
    });
  }
  return text;
};
