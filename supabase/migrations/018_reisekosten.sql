-- ============================================================
-- KPS Smart Buchhaltung – Migration 018
-- Reisekosten: eine Kategorie mit Typ-Auswahl (Kilometergeld,
-- Fahrtkosten, Nächtigung, Diäten, Konsumation) + Pflichtfelder
-- für den steuerlichen Nachweis (Reiseziel, Zweck, Zeitraum).
--
-- Hintergrund: Kilometergeld und Diäten (Verpflegungsmehraufwand)
-- sind pauschale, vorsteuerfreie Aufwandsentschädigungen (§ 4 Abs. 5
-- bzw. § 26 Z 4 EStG). Fahrtkosten (Bahn/Flug/Taxi), Nächtigung und
-- Konsumation auf Reisen werden dagegen mit dem tatsächlichen
-- Belegbetrag (inkl. ausgewiesener USt) gebucht. Nachweispflichtig
-- sind in jedem Fall Reiseziel, Zweck und Zeitraum der Reise.
-- Ausführen in: Supabase → SQL Editor → Run
-- ============================================================

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS reise_typ TEXT
    CHECK (reise_typ IN ('kilometergeld','fahrtkosten','naechtigung','diaeten','konsumation')),
  ADD COLUMN IF NOT EXISTS reise_ziel TEXT,
  ADD COLUMN IF NOT EXISTS reise_zweck TEXT,
  ADD COLUMN IF NOT EXISTS reise_von DATE,
  ADD COLUMN IF NOT EXISTS reise_bis DATE,
  ADD COLUMN IF NOT EXISTS reise_km NUMERIC(10,1),
  ADD COLUMN IF NOT EXISTS reise_stunden NUMERIC(5,1);

COMMENT ON COLUMN transactions.reise_typ IS
  'Art der Reisekosten: kilometergeld (Pauschale, keine VSt), fahrtkosten
   (Bahn/Flug/Taxi, tatsächlicher Beleg), naechtigung (Hotel, Beleg oder
   17-€-Pauschale/Nacht), diaeten (Verpflegungsmehraufwand, Pauschale nach
   Stundenstaffel, keine VSt), konsumation (sonstige Verpflegung auf Reisen).';
COMMENT ON COLUMN transactions.reise_ziel IS 'Reiseziel (Ort). Pflichtangabe für den steuerlichen Nachweis.';
COMMENT ON COLUMN transactions.reise_zweck IS 'Zweck der Dienstreise. Pflichtangabe für den steuerlichen Nachweis.';
COMMENT ON COLUMN transactions.reise_von IS 'Beginn der Reise (Datum). Pflichtangabe für den steuerlichen Nachweis.';
COMMENT ON COLUMN transactions.reise_bis IS 'Ende der Reise (Datum). Pflichtangabe für den steuerlichen Nachweis.';
COMMENT ON COLUMN transactions.reise_km IS 'Gefahrene Kilometer bei reise_typ = kilometergeld, Basis für die Pauschalberechnung.';
COMMENT ON COLUMN transactions.reise_stunden IS 'Reisedauer in Stunden bei reise_typ = diaeten, Basis für die Stundenstaffel-Berechnung.';

-- Eigene Systemkategorie anlegen (idempotent – nur falls noch nicht vorhanden)
INSERT INTO categories (tenant_id, name, type, vat_rate, is_system, sort_order)
SELECT NULL, 'Reisekosten', 'expense', 0, true,
       (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM categories WHERE type = 'expense' AND tenant_id IS NULL)
WHERE NOT EXISTS (
  SELECT 1 FROM categories
  WHERE name = 'Reisekosten' AND type = 'expense' AND tenant_id IS NULL
);

-- ============================================================
-- FERTIG
-- ✅ transactions.reise_typ / reise_ziel / reise_zweck / reise_von / reise_bis / reise_km / reise_stunden
-- ✅ Systemkategorie "Reisekosten"
-- ============================================================
