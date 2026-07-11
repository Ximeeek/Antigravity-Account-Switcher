# ADR-0002: twardy błąd dla różnych woluminów

- Status: Zaakceptowana
- Data: 2026-07-11

## Kontekst

Gwarancje rollbacku opierają się na szybkim `rename/move` w obrębie jednego woluminu. Windows może realizować przeniesienie między woluminami jako kopiowanie i usunięcie, co jest wolne, nieatomowe oraz podatne na przerwanie. `%LOCALAPPDATA%`, `%APPDATA%` i `%USERPROFILE%` mogą być przekierowane na różne dyski.

## Decyzja

Przed zapisaniem journala i przed każdą mutacją aplikacja ustala rzeczywisty wolumin magazynu profili oraz wszystkich aktywnych źródeł i celów. Porównanie wykorzystuje tożsamość woluminu systemu Windows, a nie tylko literę dysku lub tekst ścieżki.

Jeżeli wszystkie uczestniczące ścieżki nie leżą na jednym woluminie, operacja kończy się twardym, czytelnym błędem przed zmianą danych. MVP nie wykonuje automatycznego fallbacku `copy + delete`, nie przenosi samodzielnie magazynu i nie próbuje kontynuować części operacji.

## Konsekwencje

- Nietypowe konfiguracje z przekierowanymi katalogami mogą być nieobsługiwane.
- UI diagnostyczny pokazuje wykryte korzenie i woluminy bez ujawniania danych konta.
- Testy obejmują junctions, ścieżki UNC, brakujące ścieżki i różne woluminy.
- Ewentualny bezpieczny protokół cross-volume wymaga osobnego ADR i pełnego projektu stage/copy/fsync/verify/delete/recovery.
