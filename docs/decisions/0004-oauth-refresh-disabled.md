# ADR-0004: odświeżanie OAuth wyłączone do weryfikacji

- Status: Zaakceptowana, tymczasowa
- Data: 2026-07-11

## Kontekst

Silnik odświeżania nieaktywnych profili wymaga dokładnych parametrów i zachowania klienta OAuth używanego przez Antigravity. `client_id`, sposób użycia `client_secret`, obsługa rotacji refresh tokenu i wymagane pola żądania nie zostały jeszcze potwierdzone na podstawie autoryzowanego przechwycenia rzeczywistego przepływu.

Zgadywanie wartości albo użycie przypadkowego klienta może unieważnić profil, ujawnić sekret lub naruszyć oczekiwany przepływ logowania.

## Decyzja

Background Token Refresh Engine pozostaje wyłączony. Aplikacja nie wysyła żądań do `oauth2.googleapis.com/token`, nie zawiera przykładowych identyfikatorów klienta i nie próbuje pozyskiwać ich z niezweryfikowanego źródła.

Do czasu zastąpienia tego ADR aplikacja może jedynie pokazać zapisany czas wygaśnięcia i poprosić użytkownika o ręczne ponowne logowanie zgodnie z zatwierdzonym onboardingiem.

Włączenie wymaga łącznie:

1. potwierdzenia parametrów na kontrolowanym koncie i udokumentowania źródła,
2. testu sukcesu, błędnego/wycofanego refresh tokenu i ewentualnej rotacji,
3. bezpiecznego, transakcyjnego zapisu nowego poświadczenia,
4. przeglądu logów potwierdzającego brak tokenów i pełnych e-maili,
5. nowego ADR zastępującego tę decyzję.

## Konsekwencje

- Długo nieużywany profil może wymagać ponownego logowania.
- Brak refreshu jest stanem oczekiwanym, a nie powodem automatycznego przełączenia konta.
- Repozytorium, przykłady konfiguracji, fixture'y i logi nie mogą zawierać realnych ID ani sekretów OAuth.
