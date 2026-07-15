# Panel pismAI × Bitrix24 — wersja z bazą danych

Pełna wersja panelu sprzedaży i wdrożeń: backend Node.js + Express, baza PostgreSQL
(Render), upload i przechowywanie plików (umowy, protokoły, skany) bezpośrednio
w bazie, ekran logowania chroniący dostęp hasłem.

## Co się zmieniło względem wersji "jeden plik HTML"

- Dane kontrahentów (dane firmy, wymagania, kalkulacja, oferta, protokół) zapisują się
  teraz w bazie danych zamiast w plikach `.json` na dysku.
- Doszła zakładka **„6. Załączniki"** — możesz wgrywać pliki (do 15 MB każdy) powiązane
  z konkretnym kontrahentem: umowy, skany, podpisane protokoły itp.
- Doszedł ekran logowania — dostęp do panelu jest chroniony hasłem, które sam ustawisz.
- Przycisk **„📁 Kontrahenci"** pokazuje listę wszystkich zapisanych firm z możliwością
  otwarcia lub usunięcia.
- Eksport/import do pliku `.json` (dawne "Zapisz/Wczytaj projekt") został zachowany jako
  dodatkowa, niezależna kopia zapasowa — nadal działa lokalnie, bez bazy.

## Struktura projektu

```
server/
├── package.json        <- zależności (express, pg, multer, itd.)
├── server.js            <- główny plik serwera (API + logowanie + statyka)
├── db.js                 <- połączenie z PostgreSQL + tworzenie tabel
├── render.yaml           <- blueprint do automatycznego wdrożenia na Render
├── public/
│   └── login.html        <- jedyna strona dostępna bez logowania
└── private/
    └── app.html           <- właściwa aplikacja (dostępna tylko po zalogowaniu)
```

## Wdrożenie na Render + darmowa baza Neon — krok po kroku

Używamy **Neon** (neon.tech) jako bazy danych zamiast wbudowanej bazy Render, ponieważ
Neon jest **darmowy na zawsze** (bez limitu 30 dni, bez karty płatniczej) i to zwykły
PostgreSQL — zero zmian w kodzie.

### 1. Załóż darmową bazę na Neon

- Wejdź na neon.tech → załóż konto (bez karty płatniczej)
- Utwórz nowy projekt (np. `panel-bitrix`)
- Skopiuj **connection string** — najlepiej wersję **„Pooled connection"**
  (host zawiera `-pooler` w nazwie), wygląda mniej więcej tak:
  ```
  postgresql://uzytkownik:haslo@ep-xxx-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require
  ```

### 2. Wrzuć folder `server/` do repozytorium GitHub

- Załóż darmowe konto na github.com (jeśli nie masz)
- „New repository" → nazwij np. `panel-bitrix-db`
- Wgraj **całą zawartość folderu `server/`** (nie sam folder — jego zawartość ma
  wylądować w głównym katalogu repo) przez „Add file → Upload files"
- Commit changes

### 3. Wdróż przez Blueprint na Render

- Zaloguj się na dashboard.render.com (możesz przez konto GitHub)
- **New +** → **Blueprint**
- Wskaż swoje repo `panel-bitrix-db` — Render odczyta plik `render.yaml`
  i zaproponuje utworzenie web service `panel-bitrix-app`
- Kliknij **Apply**

### 4. Ustaw zmienne środowiskowe (WAŻNE)

Render poprosi o wartości dla `DATABASE_URL` i `APP_PASSWORD` (bo mają `sync: false`,
czyli nie trafiają automatycznie do repo):

- **DATABASE_URL** — wklej connection string skopiowany z Neon w kroku 1
- **APP_PASSWORD** — wpisz dowolne, mocne hasło — to nim będziesz się logować do panelu

(Jeśli wolisz to zrobić po fakcie: Dashboard → wybierz usługę `panel-bitrix-app` →
**Environment** → dodaj zmienne → Save Changes → Render sam zrobi redeploy)

### 5. Gotowe

- Po zakończeniu builda (1-3 minuty) otworzy się adres w stylu
  `https://panel-bitrix-app.onrender.com`
- Zaloguj się hasłem ustawionym w kroku 4
- Wypełnij dane swojej firmy (zakładka „1. Dane") i kliknij **„💾 Zapisz"**

## Ważne informacje o kosztach i ograniczeniach

- **Baza danych (Neon, plan Free)**: darmowa **na zawsze**, bez karty płatniczej.
  0,5 GB miejsca i 100 godzin obliczeniowych/mies. — dla jednego użytkownika z kilkoma/
  kilkunastoma kontrahentami i małymi plikami to więcej niż wystarczająco. Baza usypia
  się po 5 minutach bezczynności i budzi się automatycznie przy pierwszym zapytaniu
  (opóźnienie rzędu ułamka sekundy do ok. 1 sekundy — praktycznie niezauważalne).
- **Web Service na Render (plan Free)**: usypia się po ~15 minutach bezczynności —
  pierwsze wejście po dłuższej przerwie może potrwać do ~30-50 sekund (serwer się
  „budzi"). Jeśli to przeszkadza, plan **Starter (~25 zł/mies.)** eliminuje to opóźnienie.
- Dzięki Neon **cała ta konfiguracja może działać całkowicie za darmo**, bez żadnego
  ograniczenia czasowego — jedyny kompromis to kilkudziesięciosekundowe oczekiwanie
  przy pierwszym wejściu po dłuższej przerwie (usypia się sam serwer na Render, nie baza).

## Bezpieczeństwo

- Panel jest chroniony jednym wspólnym hasłem (`APP_PASSWORD`) — to wystarczające
  zabezpieczenie dla jednoosobowego użytku, pod warunkiem, że nikomu tego hasła
  nie udostępnisz. Render automatycznie zapewnia szyfrowane połączenie HTTPS.
- Jeśli kiedyś zechcesz dać dostęp kilku osobom z osobnymi kontami/hasłami —
  daj znać, rozbudowa o pełny system logowania (wiele kont, role) jest możliwa.

## Testowanie lokalnie (opcjonalnie, dla zaawansowanych)

Jeśli chcesz przetestować przed wdrożeniem, potrzebujesz lokalnie zainstalowanego
PostgreSQL i Node.js (18+):

```bash
cd server
npm install
export DATABASE_URL="postgresql://uzytkownik:haslo@ep-xxx-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require"
export APP_PASSWORD="twoje-testowe-haslo"
export SESSION_SECRET="cokolwiek-losowego"
npm start
```

Otwórz `http://localhost:3000` w przeglądarce.
