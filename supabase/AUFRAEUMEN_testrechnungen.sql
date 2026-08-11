-- ============================================================
-- KPS Smart Buchhaltung – Testdaten entfernen
-- Stand: 11.08.2026
--
-- Entfernt die drei verbliebenen Testrechnungen (RE-001, RE-002 und
-- den nummernlosen Entwurf) samt der daraus entstandenen Buchungen
-- sowie den Testkunden.
--
-- KEINE Migration – dieses Skript gehört nicht in den
-- Migrationsordner. Einmalig ausführen und dann vergessen.
--
-- Bitte Block für Block ausführen und die Vorschau prüfen,
-- bevor gelöscht wird.
-- ============================================================


-- ============================================================
-- 1. VORSCHAU – was ist überhaupt da?
-- ============================================================

SELECT 'Rechnung' AS art, i.id::text, COALESCE(NULLIF(i.invoice_number,''),'(ohne Nummer)') AS bezeichnung,
       i.status, i.invoice_date::text AS datum, i.total_gross AS betrag
FROM invoices i
UNION ALL
SELECT 'Buchung', t.id::text, COALESCE(t.description,'(ohne Text)'),
       t.type, t.booking_date::text, t.amount_gross
FROM transactions t
UNION ALL
SELECT 'Kunde', c.id::text, c.name, '', '', NULL
FROM customers c
UNION ALL
SELECT 'Eingangsrechnung', ii.id::text, COALESCE(ii.vendor_name,'?'),
       ii.status, ii.invoice_date::text, ii.amount_gross
FROM incoming_invoices ii
ORDER BY 1, 5;


-- ============================================================
-- 2. Sperren lösen, falls eine Buchung in einem abgeschlossenen
--    Monat liegt oder in einer übermittelten UVA steckt
-- ============================================================
-- Ohne das schlägt das Löschen am Monatsabschluss-Trigger fehl.

UPDATE transactions SET is_locked = false WHERE is_locked;

DELETE FROM month_closures;
DELETE FROM tax_returns;


-- ============================================================
-- 3. Rechnungen und die daraus entstandenen Buchungen löschen
-- ============================================================
-- Reihenfolge: erst die Verknüpfung lösen, dann Rechnungen,
-- dann Buchungen. invoices.transaction_id ist ON DELETE SET NULL,
-- eine gelöschte Buchung würde die Rechnung also stehen lassen.

-- 3a. Buchungen merken, die zu Rechnungen gehören
CREATE TEMP TABLE zu_loeschende_buchungen AS
SELECT DISTINCT t.id
FROM transactions t
LEFT JOIN invoices i           ON i.transaction_id  = t.id
LEFT JOIN incoming_invoices ii ON ii.transaction_id = t.id
WHERE i.id IS NOT NULL
   OR ii.id IS NOT NULL
   OR t.description ILIKE '%Rechnung RE-%'
   OR t.description ILIKE '%Zahlungseingang%';

SELECT count(*) AS buchungen_die_geloescht_werden FROM zu_loeschende_buchungen;

-- 3b. Rechnungen zuerst (lösen dabei die FK-Verknüpfung)
DELETE FROM invoices;
DELETE FROM incoming_invoices;

-- 3c. Die zugehörigen Buchungen
DELETE FROM transactions
WHERE id IN (SELECT id FROM zu_loeschende_buchungen);

DROP TABLE zu_loeschende_buchungen;


-- ============================================================
-- 4. Testkunde und Testlieferant
-- ============================================================
-- Die Testfirma gibt es nicht – Belege und Rechnungen dazu sind
-- oben bereits weg, der Stammsatz kann also gefahrlos verschwinden.

DELETE FROM customers;
DELETE FROM suppliers;


-- ============================================================
-- 5. Rechnungsnummernkreis zurücksetzen
-- ============================================================
-- Damit die erste echte Rechnung wieder mit 001 beginnt.

DELETE FROM invoice_counters;
UPDATE client_branding SET invoice_next_nr = 1;


-- ============================================================
-- 6. KONTROLLE – alles sollte 0 sein
-- ============================================================

SELECT
  (SELECT count(*) FROM invoices)          AS rechnungen,
  (SELECT count(*) FROM incoming_invoices) AS eingangsrechnungen,
  (SELECT count(*) FROM customers)         AS kunden,
  (SELECT count(*) FROM suppliers)         AS lieferanten,
  (SELECT count(*) FROM transactions)      AS buchungen,
  (SELECT count(*) FROM invoice_counters)  AS nummernzaehler;

-- Bleiben unter "buchungen" noch Zeilen übrig, waren das manuell
-- erfasste Buchungen ohne Rechnungsbezug. Diese Abfrage zeigt sie:
--
--   SELECT booking_date, type, amount_gross, description
--   FROM transactions ORDER BY booking_date;
--
-- Und falls die auch weg sollen:
--
--   DELETE FROM transactions;
--
-- ============================================================
