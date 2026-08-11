# Datenbank aufsetzen

Alle Migrationen liegen in diesem Ordner und werden **in numerischer
Reihenfolge** im Supabase-SQL-Editor ausgeführt: linke Leiste → **SQL
Editor** → **New query** → Dateiinhalt einfügen → **Run**.

`SETUP.md` nannte lange nur `001` und `002`. Wer sich daran hielt,
bekam eine Datenbank, in der drei Viertel der Anwendung nicht
funktioniert – ohne verwertbare Fehlermeldung, weil PostgREST
fehlende Spalten nur als `column … does not exist` meldet.

Die Migrationen ab `019` sind idempotent: sie lassen sich gefahrlos
mehrfach ausführen. Bei `001`–`018` ist das nicht durchgehend der
Fall (`CREATE TABLE` und `CREATE POLICY` ohne `IF NOT EXISTS`) – die
gehören genau einmal gelaufen, auf einer frischen Datenbank.

---

## Vor den Migrationen

Im Supabase-Dashboard unter **Database → Extensions** aktivieren:

| Erweiterung   | wofür                                          |
|---------------|------------------------------------------------|
| `uuid-ossp`   | Primärschlüssel                                 |
| `pgcrypto`    | `gen_random_uuid()`                             |
| `pg_cron`     | Daueraufträge (Migration 002)                   |

---

## Reihenfolge

### Grundgerüst

| # | Datei | Inhalt |
|---|-------|--------|
| 001 | `001_initial_schema.sql` | Alle Kerntabellen, Rollen, RLS |
| 002 | `002_recurring_cron.sql` | Cron-Job für Daueraufträge (braucht `pg_cron`) |
| 003 | `003_attachments_enabled.sql` | Belegablage je Mandant freischaltbar |
| 004 | `004_client_memberships.sql` | Mehrere Benutzer je Mandant (n:m) |
| 005 | `005_superadmin.sql` | Superadmin-Rolle |
| 006 | `006_fixes.sql` | Fehlende Superadmin-Policy, kleinere Korrekturen |
| 007 | `007_fix_helper_functions.sql` | Hilfsfunktionen auf `SECURITY DEFINER` |

### Fachliche Module

| # | Datei | Inhalt |
|---|-------|--------|
| 008 | `008_bank_import.sql` | Bankimport CAMT.053 / CSV |
| 009 | `009_invoices.sql` | Rechnungen, Kunden, Branding |
| 010 | `010_feature_flags.sql` | Kostenpflichtige Module je Mandant |
| 011 | `011_receipts.sql` | Belegerkennung (OCR) |
| 012 | `012_invoice_email.sql` | Rechnungsversand per E-Mail |
| 013 | `013_uva_workflow.sql` | UVA übermitteln, Kanzleirechte |
| 014 | `014_incoming_invoices.sql` | Eingangsrechnungen / Offene Posten |
| 015 | `015_suppliers_ust_status.sql` | Lieferanten, Kleinunternehmerregelung |
| 016 | `016_konten_monatsabschluss.sql` | Konten, Monatsabschluss, Bankabstimmung |
| 017 | `017_bewirtung.sql` | Bewirtungsspesen (§ 20 EStG) |
| 018 | `018_reisekosten.sql` | Reisekosten, Kilometergeld, Diäten |

### Aus dem Code-Review vom 11.08.2026

| # | Datei | Inhalt |
|---|-------|--------|
| 019 | `019_security_sofortmassnahmen.sql` | Rechteausweitung unterbunden, `search_path` gesetzt |
| 020 | `020_storage_policies_fix.sql` | Storage-Policies für `belege` neu aufgesetzt |
| 021 | `021_rechnungen_ist_besteuerung.sql` | Ist-Besteuerung, atomare Nummernvergabe |
| 022 | `022_rechnungsnummer_suffix.sql` | Jahres-Suffix, jährlicher Zählerlauf |
| 023 | `023_stammdaten_bezeichnung_kontakt.sql` | Bezeichnung + Kontaktperson in den Stammdaten |
| 024 | `024_eauto_und_privat.sql` | E-Auto-Kennzeichen, Privatbuchungen abgesichert |
| 025 | `025_zahlungsziel_und_zh.sql` | Zahlungsziel je Kunde, „z.H." je Rechnung |
| 026 | `026_uva_aggregation_und_sperren.sql` | UVA-Summen in der Datenbank, Sperrlogik geschlossen |
| 027 | `027_rechnungsfusszeile.sql` | Dreispaltige Fußzeile |
| 028 | `028_absenderblock_toggle.sql` | Absenderblock abschaltbar, Löschschutz für Rechnungen |
| 029 | `029_ust_kennzeichen.sql` | Umsatzsteuer-Kennzeichen je Buchung (UVA-Kennzahlen) |
| 030 | `030_belegnummer.sql` | Stabile Belegnummer je Buchung |
| 031 | `031_email_protokoll.sql` | Versandprotokoll und Mengenbegrenzung für E-Mails |
| 032 | `032_storage_absicherung.sql` | Belegpfade und Logo-Bucket abgesichert |
| 033 | `033_mandantenzuordnung.sql` | Mandantenzuordnung eindeutig statt zufällig |
| 034 | `034_kontoeroeffnungssaldo.sql` | Eröffnungssaldo je Konto |
| 035 | `035_verwaiste_zahlungen.sql` | Status nachziehen, wenn die Buchung wegfällt |
| 036 | `036_users_auth_verknuepfung.sql` | `public.users` fest an `auth.users` gebunden |
| 037 | `037_aufraeumen_fusszeile.sql` | alte einspaltige Fußzeile entfernt |
| 038 | `038_booking_mode_nachtragen.sql` | `clients.booking_mode` nachgetragen (war nur im Dashboard angelegt) |
| 039 | `039_attachments_enabled_entfernen.sql` | überholte Spalte `clients.attachments_enabled` entfernt |

> **037 und 039 nehmen etwas weg.** Sonst gilt „erst Supabase, dann
> deployen"; bei diesen beiden umgekehrt, sofern die laufende
> Anwendungsversion die Spalte noch schreibt. Bei 037 war das der
> Fall, bei 039 nicht (die Spalte wurde nirgends verwendet).

---

## Nach den Migrationen

### Storage-Buckets

Migration 020 legt `belege` an und 032 richtet die Regeln für `logos`
ein – beide setzen aber voraus, dass die Buckets existieren. Falls
nicht: **Storage → New bucket**

| Bucket   | öffentlich | max. Größe | erlaubte Typen |
|----------|-----------|-----------|----------------|
| `belege` | nein      | 10 MB     | JPEG, PNG, WEBP, HEIC, HEIF, PDF |
| `logos`  | ja        | 2 MB      | JPEG, PNG, WEBP |

`logos` ist bewusst öffentlich: das Logo wird per `getPublicUrl` ins
Rechnungs-PDF eingebunden und steht ohnehin auf jeder verschickten
Rechnung. Geschrieben werden darf trotzdem nur im eigenen
Mandantenordner (Migration 032).

### Umgebungsvariablen

| Variable | Pflicht | Zweck |
|----------|---------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | ja | Projekt-URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ja | öffentlicher Schlüssel |
| `SUPABASE_SERVICE_ROLE_KEY` | ja | Serverseitige Routen (BMD-Export, OCR, Versand). **Nie im Browser verwenden.** |
| `ANTHROPIC_API_KEY` | für OCR | Belegerkennung |
| `RESEND_API_KEY` | für Mailversand | Rechnungen und App-Einladung |
| `RESEND_FROM_EMAIL` | für Mailversand | Absenderadresse, Domäne muss bei Resend verifiziert sein |
| `NEXT_PUBLIC_APP_URL` | empfohlen | Basisadresse für Links in E-Mails. Ohne diesen Wert wird der Host-Header des Requests herangezogen. In der Produktion die echte Domain eintragen, **nicht** `localhost`. |

### Erster Benutzer

Ein Datensatz in `public.users` muss dieselbe `id` haben wie der
Zugang in **Authentication → Users**. Seit Migration 036 erzwingt ein
Fremdschlüssel das; ein Vorgabewert für die `id` existiert nicht mehr,
weil er genau diesen Fehler verdeckt hat.

```sql
-- Nach dem Anlegen des Auth-Zugangs:
INSERT INTO public.users (id, tenant_id, email, full_name, role)
VALUES ('<auth-user-id>', '<tenant-id>', 'name@kanzlei.at', 'Vorname Nachname', 'kanzlei');

INSERT INTO client_memberships (client_id, user_id)
VALUES ('<client-id>', '<auth-user-id>');
```

---

## Prüfen, ob alles gelaufen ist

Am schnellsten mit `supabase/DIAGNOSE_schema_abgleich.sql`: die Abfrage
trägt die erwartete Struktur in sich und meldet beides – was fehlt und
was zusätzlich vorhanden ist. Sie ändert nichts.

```
OK |  | Alles deckungsgleich.
```

`EXTRA` bedeutet: in der Datenbank angelegt, aber in keiner Migration
beschrieben – so hat `clients.booking_mode` monatelang unbemerkt nur im
Dashboard existiert. Solche Funde gehören in eine neue Migration
nachgetragen, sonst fehlen sie beim nächsten Aufbau.

### Von Hand

```sql
-- Muss 22 ergeben, wenn alle Migrationen durch sind:
SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';

-- Stichproben auf die zuletzt ergänzten Spalten:
SELECT column_name FROM information_schema.columns
WHERE table_name = 'transactions'
  AND column_name IN ('ust_kennzeichen', 'beleg_nr', 'is_eauto', 'is_private');

SELECT column_name FROM information_schema.columns
WHERE table_name = 'accounts' AND column_name LIKE 'opening%';

-- Keine Policy darf mehr get_my_client_id() verwenden:
SELECT policyname, tablename FROM pg_policies
WHERE schemaname = 'public'
  AND (COALESCE(qual,'') || COALESCE(with_check,'')) LIKE '%get_my_client_id()%';
```
