# ADR-0001: DPAPI dla poświadczeń profili

- Status: Zaakceptowana
- Data: 2026-07-11

## Kontekst

Nieaktywne profile potrzebują kopii danych OAuth, ale tokeny nie mogą być zapisane jako plaintext. Aplikacja działa wyłącznie na Windows i nie ma wymagania przenoszenia profili między użytkownikami ani komputerami. Sam AES-256-GCM nie rozwiązuje problemu bezpiecznego przechowywania klucza głównego.

## Decyzja

Zserializowane poświadczenie profilu chronimy przez Windows DPAPI (`CryptProtectData`) w zakresie bieżącego użytkownika i zapisujemy jako wersjonowaną kopertę `credentials.enc`. Odszyfrowanie używa `CryptUnprotectData` w tym samym kontekście użytkownika.

Koperta zawiera wyłącznie wersję formatu, identyfikator mechanizmu ochrony i ciphertext. Nigdy nie zawiera alternatywnej kopii plaintext ani klucza. Bufory plaintext mają możliwie krótki czas życia i są zerowane po użyciu. Błąd DPAPI przerywa operację; nie ma słabszego fallbacku.

Aktywny token nadal jest zapisywany przez Windows Credential Manager zgodnie z formatem wymaganym przez Antigravity. DPAPI chroni magazyn profili, nie zastępuje aktywnego wpisu edytora.

## Konsekwencje

- Profil jest związany z użytkownikiem Windows i zwykle nie może być skopiowany na inne konto lub komputer.
- Reset profilu Windows/DPAPI może uniemożliwić odzyskanie zapisanych tokenów; UI powinien wtedy wymagać ponownego logowania.
- Testy platformowe muszą używać syntetycznych sekretów i usuwać artefakty po zakończeniu.
- Logi mogą zawierać `profile_id` i informację `credential_present=true`, ale żadnych bajtów tokenu, ciphertextu ani sekretu API.
