-- ============================================================
-- KPS Smart Buchhaltung – Migration 024
-- E-Auto-Kennzeichnung und Absicherung der Privatbuchungen
--
-- Behebt:
--   F-4  Die E-Auto-Vorsteuerdeckelung steckte nur im Neuanlage-
--        Formular und ging bei jedem Bearbeiten verloren, weil die
--        Kennzeichnung nur als Freitext-Marker in der Beschreibung
--        stand. Jetzt eine echte Spalte.
--   F-5  is_private wurde ausser in der Kontoabstimmung nirgends
--        ausgewertet – Privatumsätze liefen mit Vorsteuerabzug in
--        UVA, Dashboard, BMD-Export und Kleinunternehmergrenze.
--        Die Filterung passiert im Anwendungscode; hier kommt der
--        Index dazu, der sie trägt.
--
-- Idempotent. Ausfuehren in: Supabase -> SQL Editor -> Run
-- ============================================================


-- ============================================================
-- TEIL A – E-Auto als Spalte statt als Marker im Beschreibungstext
-- ============================================================

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS is_eauto BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN transactions.is_eauto IS
  'Anschaffung eines emissionsfreien Kfz. Steuert die Vorsteuerdeckelung nach § 12 Abs. 2 Z 2 lit. b UStG (Angemessenheitsgrenze 40.000 brutto, kein Abzug über 80.000).';

-- Altbestand aus dem bisherigen Freitext-Marker übernehmen.
UPDATE transactions
   SET is_eauto = true
 WHERE is_eauto = false
   AND description LIKE '%[E-Auto:%';


-- ============================================================
-- TEIL B – Index für die Auswertungen ohne Privatumsätze
-- ============================================================
-- UVA, Dashboard, BMD-Export und die Kleinunternehmer-Ampel filtern
-- ab sofort auf is_private = false. Der bestehende Index
-- idx_transactions_date(client_id, booking_date) trägt die Abfrage
-- weiterhin; dieser partielle Index hält den häufigen Fall schlank.

CREATE INDEX IF NOT EXISTS idx_transactions_betrieblich
  ON transactions (client_id, booking_date)
  WHERE is_private = false;


-- ============================================================
-- KONTROLLE
-- ============================================================
--
-- Übernommene E-Auto-Buchungen prüfen – stimmt die gespeicherte
-- Vorsteuer noch mit dem Markertext überein?
--
--   SELECT booking_date, amount_net, vat_amount, amount_gross, description
--   FROM transactions WHERE is_eauto ORDER BY booking_date;
--
-- Privatumsätze, die bisher mit Vorsteuer in die UVA gelaufen sind:
--
--   SELECT c.company_name, count(*), sum(t.vat_amount) AS zu_unrecht_vorsteuer
--   FROM transactions t JOIN clients c ON c.id = t.client_id
--   WHERE t.is_private AND t.vat_amount <> 0
--   GROUP BY c.company_name;
--
-- ============================================================
