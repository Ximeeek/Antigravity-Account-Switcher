# ADR-0003: trwały journal każdej mutacji

- Status: Zaakceptowana
- Data: 2026-07-11

## Kontekst

Pole `current_step` nie wystarcza, gdy proces kończy się po drugiej z kilku operacji `move` w jednym kroku. Recovery musi rozróżnić mutacje zaplanowane, faktycznie wykonane i cofnięte, także po awarii pomiędzy zmianą systemu plików a aktualizacją locka.

## Decyzja

`switcher.lock` jest wersjonowanym, trwałym journalem operacji. Zawiera co najmniej:

- `schema_version`, `operation_id`, `from_profile_id`, `to_profile_id`, `started_at`,
- bieżący etap i stan całej operacji,
- uporządkowaną listę mutacji z typem, kanonicznym źródłem, celem, oczekiwanym manifestem i stanem `planned`, `applied` albo `rolled_back`,
- informacje potrzebne do jednoznacznego wznowienia lub rollbacku bez tokenów i e-maili.

Każda mutacja jest najpierw zapisywana jako `planned`. Po trwałej aktualizacji journala wykonywany jest dokładnie jeden `move`, a następnie journal przechodzi do `applied`. Aktualizacja locka używa pliku tymczasowego na tym samym woluminie, flushu i atomowego replace. Recovery dla niejednoznacznego `planned` sprawdza źródło, cel i manifest, zamiast wykonywać operację w ciemno.

Rollback przechodzi listę `applied` w odwrotnej kolejności i także trwale zapisuje wynik każdej cofniętej mutacji. Journal jest usuwany dopiero po kontroli spójności całego profilu i aktywnego Credential Managera.

## Konsekwencje

- Recovery jest deterministyczne także po awarii w środku kroku 4 lub 5.
- Implementacja wymaga adaptera trwałego zapisu i testów fault injection przed i po każdej granicy I/O.
- Istniejące cele, brakujące źródła lub niezgodny manifest zatrzymują automatyczne recovery i wymagają kontrolowanego trybu naprawy.
- Globalny mutex procesu nadal jest wymagany; sam plik journala nie rozwiązuje wszystkich wyścigów między dwoma procesami aplikacji.
