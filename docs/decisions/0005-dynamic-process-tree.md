# ADR-0005: dynamiczna identyfikacja drzewa procesów

- Status: Zaakceptowana
- Data: 2026-07-11

## Kontekst

Antigravity/Electron uruchamia proces główny, renderery, extension hosty i backend językowy. Lista nazw oraz struktura rodzic–dziecko mogą zmieniać się między wersjami. Zabijanie wszystkich procesów o nazwie `Antigravity.exe` lub `language_server.exe` może zakończyć niezwiązany proces, a statyczna lista może pozostawić uchwyt blokujący dane.

## Decyzja

Process Manager wykrywa kanoniczną ścieżkę zweryfikowanej instalacji i dynamicznie enumeruje proces główny oraz jego potomków na podstawie snapshotu procesów i relacji PID/parent PID. Snapshot jest odświeżany podczas zamykania, ponieważ proces może utworzyć kolejnego potomka.

Procesy odłączone od drzewa, w tym backend językowy, mogą zostać dołączone do zestawu tylko wtedy, gdy jednocześnie pasują do kanonicznej ścieżki tej samej instalacji, użytkownika Windows i sesji. Sama nazwa pliku nigdy nie wystarcza.

Najpierw wysyłane jest grzeczne zamknięcie do odpowiednich okien procesu głównego. Po kontrolowanym oczekiwaniu wszystkie zidentyfikowane procesy są ponownie sprawdzane. Force-kill dotyczy wyłącznie pozostałych procesów ze zweryfikowanego zestawu i jest logowany per PID bez pełnych linii poleceń mogących zawierać dane użytkownika.

## Konsekwencje

- Dokładne nazwy zaobserwowanych procesów pozostają fixture'em/testem kompatybilności, a nie podstawą algorytmu.
- Przed każdą wersją Antigravity potrzebny jest test integracyjny drzewa i zachowania graceful shutdown.
- Brak dostępu do ścieżki, właściciela lub sesji procesu oznacza bezpieczne przerwanie, a nie szeroki kill po nazwie.
- Argumenty potrzebne do odtworzenia workspace są przechwytywane wyłącznie w pamięci i nie trafiają do zwykłych logów.
