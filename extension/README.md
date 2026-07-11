# Antigravity Account Switcher — extension

Cienka wtyczka do Antigravity/VS Code API. Pokazuje aktywny profil na pasku stanu i przekazuje **wyłącznie ręczne** polecenia użytkownika do lokalnej aplikacji desktopowej.

Wtyczka nie odczytuje ani nie przechowuje tokenów Google, nie odświeża tokenów OAuth, nie reaguje automatycznie na 429 i nie przełącza kont w tle.

## Funkcje

- status aktywnego profilu na pasku stanu,
- QuickPick z pozostałymi profilami,
- modalne potwierdzenie przed aktywacją profilu,
- ręczne odświeżenie stanu,
- pokazanie okna aplikacji desktopowej,
- czytelne komunikaty dla błędnej konfiguracji, timeoutu, braku połączenia, błędu autoryzacji, trwającej operacji i wymaganego recovery.

## Konfiguracja

Ustawienia mają zakres `machine`:

```json
{
  "antigravityAccountSwitcher.port": 48731,
  "antigravityAccountSwitcher.apiSecret": "wstaw-sekret-wygenerowany-lokalnie",
  "antigravityAccountSwitcher.requestTimeoutMs": 5000
}
```

`apiSecret` jest sekretem transportowym lokalnego API, a nie tokenem Google OAuth. Host nie jest konfigurowalny: klient zawsze łączy się przez zwykły HTTP z `127.0.0.1` i nie obsługuje przekierowań. Manifest oznacza wtyczkę jako `ui`, dzięki czemu w środowisku Remote nie jest przenoszona na zdalny extension host.

## Komendy

| Identyfikator | Polecenie |
| --- | --- |
| `antigravityAccountSwitcher.activateProfile` | Pobierz aktualny stan, pokaż QuickPick i po potwierdzeniu zleć aktywację. |
| `antigravityAccountSwitcher.refresh` | Ręcznie odśwież pasek stanu. |
| `antigravityAccountSwitcher.openSwitcher` | Poproś działającą aplikację desktopową o pokazanie okna. |

Kliknięcie elementu na pasku stanu uruchamia `activateProfile`.

## Lokalne API

Każde żądanie zawiera `Authorization: Bearer <apiSecret>` i ma skonfigurowany timeout. Wtyczka nie wykonuje automatycznych ponowień.

### `GET /api/v1/status`

Przykładowa odpowiedź:

```json
{
  "engineStatus": "ready",
  "recoveryRequired": false,
  "activeProfile": {
    "profileId": "2c5b4c63-f5e8-4f30-9b91-22a7e96a56c2",
    "displayName": "Praca",
    "accountEmail": "opcjonalny@example.invalid",
    "tokenStatus": "valid"
  },
  "profiles": [],
  "message": null
}
```

Backend używa `engineStatus: ready | working | attention`; wtyczka mapuje je odpowiednio na stan gotowy, zajęty i wymagający uwagi. `recoveryRequired: true` ma pierwszeństwo i blokuje aktywację z wtyczki. Dla zgodności podczas migracji akceptowane są także nazwy pól `snake_case` oraz starsze wartości `busy`, `error` i `recovery`.

Profil wymaga `profileId` i `displayName`. `accountEmail` jest opcjonalny. Backend zwraca stany tokenu `valid`, `expiring_soon`, `expired` lub `unknown`; starsza wartość `expiring` jest również akceptowana.

### `POST /api/v1/app/show`

Pokazuje okno już działającej aplikacji desktopowej. To nie jest mechanizm uruchamiania pliku wykonywalnego, gdy backend jest wyłączony.

### `POST /api/v1/profiles/{profileId}/activate`

Żądanie jest wysyłane dopiero po wyborze profilu i modalnym potwierdzeniu:

```json
{
  "source": "extension"
}
```

Odpowiedź może zawierać `accepted`, `operationId` i bezpieczny komunikat `message`. Kod `409` oznacza trwającą operację, `423` wymagane recovery, a `401`/`403` niezgodny sekret. Kod `429` jest tylko pokazany użytkownikowi — wtyczka nie ponawia żądania ani nie wybiera innego konta.

## Budowanie

```powershell
cd extension
npm ci
npm run check
npm run package
```

Kod wynikowy powstaje w `dist/extension.js`. Docelowa instalacja/aktualizacja wtyczki należy do aplikacji desktopowej; repozytorium nie zawiera realnego sekretu API.

## Diagnostyka i prywatność

Kanał wyjściowy `Antigravity Account Switcher` zapisuje czas, metodę, ścieżkę endpointu, status HTTP i czas trwania. Nie zapisuje nagłówka Bearer, treści żądań, e-maili ani tokenów. Identyfikator profilu może pojawić się jako część ścieżki aktywacji.
