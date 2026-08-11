-- ============================================================
-- KPS Smart Buchhaltung – Migration 017
-- Bewirtungsspesen: Pflichtfelder Anlass/Teilnehmer + eigene Kategorie
--
-- Hintergrund: Bewirtungskosten mit nachgewiesenem Werbezweck (z.B.
-- Geschäftsessen mit Kunden) sind einkommensteuerlich in Österreich idR
-- nur zu 50% abzugsfähig (§ 20 Abs. 1 Z 3 EStG). Die Vorsteuer bleibt davon
-- unabhängig idR zur Gänze abzugsfähig, sofern zumindest teilweise
-- Abzugsfähigkeit besteht. Voraussetzung für beides ist der Nachweis von
-- Anlass und Teilnehmern der Bewirtung.
--
-- Diese Migration bildet die Buchung bewusst mit dem vollen bezahlten
-- Betrag ab (korrekt für Bankabgleich und vollen Vorsteuerabzug) und
-- dokumentiert Anlass/Teilnehmer direkt an der Buchung. Die 50%-Kürzung
-- für die Einkommensteuer erfolgt auf dieser Datenbasis im Rahmen der
-- Steuererklärung durch die Kanzlei.
-- Ausführen in: Supabase → SQL Editor → Run
-- ============================================================

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS bewirtung_anlass TEXT,
  ADD COLUMN IF NOT EXISTS bewirtung_teilnehmer TEXT;

COMMENT ON COLUMN transactions.bewirtung_anlass IS
  'Anlass der Bewirtung (z.B. "Projektbesprechung"). Pflichtangabe für die
   steuerliche Abzugsfähigkeit von Bewirtungsspesen gem. § 20 EStG, wird bei
   Kategorie "Bewirtungsspesen (Geschäftsessen)" in der App erzwungen.';

COMMENT ON COLUMN transactions.bewirtung_teilnehmer IS
  'Namen der bewirteten Personen/Teilnehmer. Pflichtangabe für die
   steuerliche Abzugsfähigkeit von Bewirtungsspesen gem. § 20 EStG.';

-- Eigene Systemkategorie anlegen (idempotent – nur falls noch nicht vorhanden)
INSERT INTO categories (tenant_id, name, type, vat_rate, is_system, sort_order)
SELECT NULL, 'Bewirtungsspesen (Geschäftsessen)', 'expense', 20, true,
       (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM categories WHERE type = 'expense' AND tenant_id IS NULL)
WHERE NOT EXISTS (
  SELECT 1 FROM categories
  WHERE name = 'Bewirtungsspesen (Geschäftsessen)' AND type = 'expense' AND tenant_id IS NULL
);

-- ============================================================
-- FERTIG
-- ✅ transactions.bewirtung_anlass / bewirtung_teilnehmer
-- ✅ Systemkategorie "Bewirtungsspesen (Geschäftsessen)"
-- ============================================================
