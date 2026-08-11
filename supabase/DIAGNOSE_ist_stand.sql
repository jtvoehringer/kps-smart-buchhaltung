-- ============================================================
-- KPS Smart Buchhaltung – Diagnose des Ist-Stands
-- Stand: 11.08.2026, im Rahmen des Code Reviews
--
-- NUR LESEND. Diese Datei aendert nichts. Sie beantwortet die Fragen,
-- die sich aus dem Code allein nicht beantworten lassen, weil einige
-- Aenderungen offenbar direkt im Supabase-Dashboard gemacht wurden.
--
-- Bitte VOR Migration 020 ausfuehren – vor allem Abfrage 1.
-- Ausfuehren in: Supabase -> SQL Editor -> Run (Block fuer Block)
-- ============================================================


-- ============================================================
-- 1. Welche Storage-Policies existieren wirklich?          [WICHTIG]
-- ============================================================
-- Migration 003 legt vier Policies an, Migration 011 beschreibt in
-- Kommentaren drei voellig offene ("auth.uid() IS NOT NULL").
-- Diese Abfrage zeigt, was tatsaechlich aktiv ist.
--
-- Alarmzeichen: eine Policy, deren qual/with_check nur
-- "auth.uid() IS NOT NULL" enthaelt und keinen client_id-Bezug.
-- Dann kann derzeit jeder Klient die Belege jedes anderen Mandanten
-- lesen und loeschen.

SELECT policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
ORDER BY policyname;


-- ============================================================
-- 2. Heisst die Spalte size_bytes oder file_size?
-- ============================================================
-- Migration 001 sagt size_bytes, der Code schreibt file_size.
-- Kommt hier "file_size" zurueck, wurde sie im Dashboard umbenannt
-- (dann ist der Migrationssatz nicht mehr die Wahrheit).
-- Kommt "size_bytes" zurueck, schlaegt jeder Beleg-Upload an eine
-- Buchung derzeit still fehl.

SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'attachments'
ORDER BY ordinal_position;


-- ============================================================
-- 3. Existiert clients.booking_mode in der Datenbank?
-- ============================================================
-- Die Spalte steuert Netto-/Brutto-Eingabe, existiert aber in keiner
-- Migration (database.types.ts:51 sagt "Migration via Dashboard").
-- Kommt hier keine Zeile, ist die Buchungserfassung auf einer frisch
-- aufgebauten Instanz komplett unbenutzbar.

SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'clients'
  AND column_name IN ('booking_mode', 'vat_liable', 'ust_status', 'attachments_enabled');


-- ============================================================
-- 4. Wer darf die kritischen Funktionen ausfuehren?
-- ============================================================
-- Vor Migration 019: process_recurring_transactions und
-- get_auth_user_id_by_email sind fuer authenticated (und ggf. anon)
-- ausfuehrbar. Nach 019 muss diese Abfrage leer sein.

SELECT p.proname AS funktion, r.rolname AS rolle
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
CROSS JOIN (VALUES ('anon'), ('authenticated')) AS r(rolname)
WHERE n.nspname = 'public'
  AND p.proname IN ('process_recurring_transactions', 'get_auth_user_id_by_email')
  AND has_function_privilege(r.rolname, p.oid, 'EXECUTE')
ORDER BY 1, 2;


-- ============================================================
-- 5. Darf authenticated die users-Tabelle updaten?
-- ============================================================
-- Vor Migration 019: UPDATE auf allen Spalten, also auch auf role
-- und tenant_id. Nach 019 duerfen nur noch full_name und language
-- auftauchen.

SELECT grantee, privilege_type, column_name
FROM information_schema.column_privileges
WHERE table_schema = 'public' AND table_name = 'users'
  AND grantee IN ('anon', 'authenticated')
  AND privilege_type = 'UPDATE'
ORDER BY grantee, column_name;


-- ============================================================
-- 6. Gibt es bereits doppelt gebuchte Rechnungen?           [WICHTIG]
-- ============================================================
-- Befund F-1: Finalisieren, "Als bezahlt buchen" und der Bankimport
-- erzeugen jeweils eine eigene Einnahmenbuchung, ohne voneinander zu
-- wissen. Diese Abfrage findet Einnahmen mit identischem Betrag beim
-- selben Mandanten.
--
-- Erwartung bei sauberen Daten: keine Zeilen, oder nur solche, bei
-- denen die Beschreibungen erkennbar unterschiedliche Vorgaenge sind.
-- Verdaechtig ist das Paar
--   "Rechnung RE-0xx – Kunde"  +  "Zahlungseingang RE-0xx"

SELECT
  c.company_name,
  t.amount_net,
  t.vat_amount,
  count(*)                                AS anzahl,
  string_agg(DISTINCT t.description, ' | ' ORDER BY t.description) AS beschreibungen,
  string_agg(DISTINCT t.booking_date::text, ', ')                  AS datumsangaben
FROM transactions t
JOIN clients c ON c.id = t.client_id
WHERE t.type = 'income'
GROUP BY c.company_name, t.client_id, t.amount_net, t.vat_amount
HAVING count(*) > 1
ORDER BY count(*) DESC, t.amount_net DESC;


-- ============================================================
-- 7. Gezielter: Rechnungen mit Erloesbuchung UND Zahlungsbuchung
-- ============================================================
-- Praeziser als Abfrage 6 – sucht genau das Muster aus F-1.

SELECT
  i.invoice_number,
  i.total_net,
  i.total_gross,
  i.status,
  i.transaction_id,
  count(t.id) AS gefundene_buchungen,
  string_agg(t.description || ' (' || t.booking_date || ')', ' | ') AS buchungen
FROM invoices i
JOIN transactions t
  ON t.client_id = i.client_id
 AND t.type = 'income'
 AND i.invoice_number IS NOT NULL
 AND i.invoice_number <> ''
 AND t.description LIKE '%' || i.invoice_number || '%'
GROUP BY i.id, i.invoice_number, i.total_net, i.total_gross, i.status, i.transaction_id
HAVING count(t.id) > 1
ORDER BY i.invoice_number;


-- ============================================================
-- 8. Rechnungen ohne Nummer oder ohne verknuepfte Buchung
-- ============================================================
-- Befund F-2/F-3: Entwuerfe werden mit invoice_number = '' gespeichert.
-- Eine offene Rechnung mit leerer Nummer ist gefaehrlich, weil
-- "Als bezahlt markieren" dann .like('description','%%') ausfuehrt und
-- ALLE Buchungen des Mandanten auf ein Datum schiebt.
--
-- Findet diese Abfrage eine Zeile mit status <> 'draft' und leerer
-- Nummer: bitte diese Rechnung NICHT als bezahlt markieren, bevor
-- F-3 behoben ist.

SELECT
  c.company_name,
  i.id,
  COALESCE(NULLIF(i.invoice_number, ''), '(LEER)') AS rechnungsnummer,
  i.status,
  i.invoice_date,
  i.total_gross,
  i.transaction_id
FROM invoices i
JOIN clients c ON c.id = i.client_id
WHERE i.invoice_number IS NULL
   OR i.invoice_number = ''
   OR i.transaction_id IS NULL
ORDER BY c.company_name, i.invoice_date DESC;


-- ============================================================
-- 9. E-Auto-Buchungen: stimmt die Vorsteuer noch?
-- ============================================================
-- Befund F-4: Das Bearbeiten-Formular kennt die Deckelung nicht und
-- rechnet vat_amount beim Speichern neu. Der Marker in der
-- Beschreibung bleibt aber stehen.
--
-- Wenn hier eine Zeile erscheint, bei der vat_amount deutlich ueber
-- 8.000 liegt (= 40.000 x 20 %) oder nicht zum Markertext passt,
-- wurde die Buchung nach dem Anlegen bearbeitet und die Deckelung
-- ging verloren.

SELECT
  c.company_name,
  t.booking_date,
  t.amount_net,
  t.vat_amount,
  t.description
FROM transactions t
JOIN clients c ON c.id = t.client_id
WHERE t.description LIKE '%[E-Auto:%'
ORDER BY t.booking_date DESC;


-- ============================================================
-- 10. Privatbuchungen, die in der UVA mitlaufen
-- ============================================================
-- Befund F-5: is_private wird nur in der Kontoabstimmung ausgewertet.
-- Jede Zeile hier mit vat_amount > 0 ist zu Unrecht geltend gemachte
-- Vorsteuer.

SELECT
  c.company_name,
  count(*)             AS anzahl,
  sum(t.amount_net)    AS netto_summe,
  sum(t.vat_amount)    AS vorsteuer_summe
FROM transactions t
JOIN clients c ON c.id = t.client_id
WHERE t.is_private = true
GROUP BY c.company_name
ORDER BY sum(t.vat_amount) DESC NULLS LAST;


-- ============================================================
-- 11. Gibt es Nutzer mit unerwarteter Rolle?
-- ============================================================
-- Kontrolle zu S-2: falls jemand die Luecke bereits genutzt hat,
-- steht hier ein superadmin oder admin, der dort nicht hingehoert.

SELECT u.email, u.role, u.tenant_id, te.name AS kanzlei, u.created_at, u.last_login
FROM users u
LEFT JOIN tenants te ON te.id = u.tenant_id
ORDER BY
  CASE u.role WHEN 'superadmin' THEN 1 WHEN 'admin' THEN 2 WHEN 'kanzlei' THEN 3 ELSE 4 END,
  u.email;


-- ============================================================
-- Ende der Diagnose. Ergebnisse von Abfrage 1, 2, 6 und 7 bitte
-- zurueckmelden – daraus ergibt sich, ob Migration 020 unveraendert
-- laufen kann und wie dringend F-1 ist.
-- ============================================================
