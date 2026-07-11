# Architecture Decision Records

| ADR | Status | Decyzja |
| --- | --- | --- |
| [0001](0001-dpapi-profile-credentials.md) | Zaakceptowana | Poświadczenia nieaktywnych profili chroni DPAPI Current User. |
| [0002](0002-same-volume-hard-fail.md) | Zaakceptowana | Różne woluminy blokują operację przed mutacją. |
| [0003](0003-per-move-operation-journal.md) | Zaakceptowana | `switcher.lock` jest trwałym journalem każdej mutacji. |
| [0004](0004-oauth-refresh-disabled.md) | Zaakceptowana, tymczasowa | Odświeżanie OAuth pozostaje wyłączone do weryfikacji parametrów. |
| [0005](0005-dynamic-process-tree.md) | Zaakceptowana | Procesy są identyfikowane dynamicznie i ograniczone do właściwej instalacji/sesji. |

ADR opisuje decyzję, jej uzasadnienie i konsekwencje. Zmiana zaakceptowanej decyzji wymaga nowego ADR zastępującego poprzedni, zamiast cichej edycji historii.
