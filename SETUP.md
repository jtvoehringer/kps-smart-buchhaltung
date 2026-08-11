# KPS Smart Buchhaltung – Setup-Anleitung

Schritt-für-Schritt, auch ohne Programmiererfahrung. Jeder Schritt dauert 5–15 Minuten.

---

## Voraussetzungen (einmalig installieren)

1. **Node.js** → https://nodejs.org → "LTS" Version herunterladen & installieren
2. **Git** → https://git-scm.com → herunterladen & installieren
3. **VS Code** (Editor) → https://code.visualstudio.com → herunterladen & installieren

---

## Schritt 1: GitHub-Repository anlegen

1. Gehe zu https://github.com → Account erstellen (falls noch keiner vorhanden)
2. Klicke oben rechts auf **"+"** → **"New repository"**
3. Name: `kps-smart-buchhaltung`
4. Stelle auf **"Private"** (wichtig – kein öffentlicher Zugriff)
5. Klicke **"Create repository"**
6. Kopiere die angezeigte Repository-URL (z.B. `https://github.com/DEIN-NAME/kps-smart-buchhaltung.git`)

---

## Schritt 2: Projekt zu GitHub hochladen

Öffne ein Terminal (Windows: Suche nach "cmd" oder "PowerShell"):

```bash
# Navigiere zum Projektordner (passe den Pfad an)
cd "C:\Users\joerg\Documents\Claude\Projects\Smart book keeping\kps-smart-buchhaltung"

# Git initialisieren
git init
git add .
git commit -m "Erster Commit: Projektstruktur"

# Verbinde mit GitHub (ersetze URL mit deiner Repository-URL)
git remote add origin https://github.com/DEIN-NAME/kps-smart-buchhaltung.git
git branch -M main
git push -u origin main
```

---

## Schritt 3: Supabase-Projekt anlegen

1. Gehe zu https://supabase.com → **"Start your project"** → mit GitHub anmelden
2. Klicke **"New project"**
3. Name: `kps-smart-buchhaltung`
4. Passwort: Ein sicheres Passwort wählen und **gut aufschreiben** (Datenbankpasswort)
5. Region: **Frankfurt (eu-central-1)** – wichtig für DSGVO/EU-Hosting
6. Klicke **"Create new project"** (dauert ~2 Minuten)

### Datenbank einrichten

Zuerst unter **Database → Extensions** aktivieren: `uuid-ossp`,
`pgcrypto` und `pg_cron`.

Dann die Migrationen einspielen:

1. Im Supabase Dashboard: Linke Seite → **"SQL Editor"**
2. Klicke **"New query"**
3. Öffne die erste Datei aus `supabase/migrations/` in VS Code
4. Kopiere den gesamten Inhalt → in den SQL Editor einfügen → **"Run"** klicken
5. Wiederhole das für **jede weitere Datei in numerischer Reihenfolge**

> **Alle Dateien, nicht nur die ersten zwei.** Hier standen lange nur
> `001` und `002`. Wer sich daran hielt, bekam eine Datenbank, in der
> drei Viertel der Anwendung nicht funktioniert – ohne verwertbare
> Fehlermeldung, weil eine fehlende Spalte nur als
> `column … does not exist` auftaucht.
>
> Welche Datei was macht, was vorher und was hinterher zu tun ist
> (Storage-Buckets, erster Benutzer, Umgebungsvariablen) und wie man
> prüft, ob alles durchgelaufen ist, steht in
> **`supabase/migrations/README.md`**.

### API-Keys kopieren

1. Linke Seite → **"Settings"** → **"API"**
2. Kopiere **"Project URL"** → brauchst du gleich
3. Kopiere **"anon public"** Key → brauchst du gleich

---

## Schritt 4: Umgebungsvariablen einrichten

1. Im Projektordner: Kopiere `.env.local.example` und benenne es `.env.local`
2. Öffne `.env.local` in VS Code
3. Ersetze die Platzhalter mit deinen Supabase-Werten:

```
NEXT_PUBLIC_SUPABASE_URL=https://DEIN-PROJEKT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=dein-anon-key-hier
```

Für den vollen Funktionsumfang kommen dazu (lokal in `.env.local`, in
der Produktion unter **Vercel → Settings → Environments → Production**):

| Variable | wofür |
|----------|-------|
| `SUPABASE_SERVICE_ROLE_KEY` | BMD-Export, Belegerkennung, Mailversand. Steht in Supabase unter Settings → API. **Nie im Browser verwenden** – dieser Schlüssel umgeht sämtliche Zugriffsregeln. |
| `ANTHROPIC_API_KEY` | Belegerkennung |
| `RESEND_API_KEY` / `RESEND_FROM_EMAIL` | Rechnungsversand und App-Einladung |
| `NEXT_PUBLIC_APP_URL` | Basisadresse für Links in versendeten E-Mails. In der Produktion die echte Domain, **nicht** `localhost`. |

---

## Schritt 5: Lokal starten & testen

Im Terminal:

```bash
# Im Projektordner
cd "C:\Users\joerg\Documents\Claude\Projects\Smart book keeping\kps-smart-buchhaltung"

# Abhängigkeiten installieren (nur beim ersten Mal)
npm install

# Entwicklungsserver starten
npm run dev
```

Öffne im Browser: **http://localhost:3000**

Du solltest die Login-Seite sehen. ✅

---

## Schritt 6: Auf Vercel deployen (öffentlich erreichbar machen)

1. Gehe zu https://vercel.com → mit GitHub anmelden
2. Klicke **"Add New Project"**
3. Wähle dein `kps-smart-buchhaltung` Repository → **"Import"**
4. Unter **"Environment Variables"** füge hinzu:
   - `NEXT_PUBLIC_SUPABASE_URL` = deine Supabase URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = dein Anon Key
5. Klicke **"Deploy"** (dauert ~2 Minuten)

Nach dem Deploy bekommst du eine URL wie `https://kps-smart-buchhaltung.vercel.app` – das ist deine Live-App!

---

## Schritt 7: Ersten Kanzlei-Mandanten anlegen

Im Supabase SQL Editor:

```sql
-- KPS als ersten Mandanten anlegen
INSERT INTO tenants (name, slug, plan, max_clients, active_until)
VALUES ('KPS Steuerberatung', 'kps', 'standard', 40, '2027-12-31');
```

---

## Nächste Schritte nach dem Setup

Sag Claude einfach was gebaut werden soll – z.B.:

- "Baue die Seite zum Erfassen einer neuen Buchung"
- "Baue die Daueraufträge-Verwaltung"
- "Baue das KPS-Kanzlei-Dashboard"

Claude schreibt den Code, erklärt jeden Schritt und du siehst das Ergebnis sofort im Browser.

---

## Hilfe & häufige Probleme

| Problem | Lösung |
|---------|--------|
| `npm install` schlägt fehl | Node.js Version prüfen: `node --version` (sollte 18+ sein) |
| Supabase-Fehler | API-Keys in `.env.local` nochmals prüfen |
| Login funktioniert nicht | In Supabase → Authentication → Providers: "Email" aktivieren |
| Seite lädt nicht | `npm run dev` nochmals starten |

---

*Erstellt mit IC&P Consultants e.U. & Claude (Anthropic)*
