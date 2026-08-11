-- ============================================================
-- KPS Smart Buchhaltung – Migration 025
-- Zahlungsziel je Kunde und "z.H."-Feld je Rechnung
--
-- Hintergrund:
--   Das Zahlungsziel kam bisher ausschliesslich aus
--   client_branding.payment_days – also ein Wert fuer ALLE Kunden.
--   Damit war die Faelligkeit und in der Folge die Ueberfaelligkeit
--   fuer Kunden mit abweichender Vereinbarung schlicht falsch.
--
--   Der Ansprechpartner stand nur im Kundenstamm. Auf einer
--   konkreten Rechnung soll er abweichen koennen ("z.H. Frau X"),
--   ohne den Stammsatz zu aendern.
--
-- Idempotent. Ausfuehren in: Supabase -> SQL Editor -> Run
-- ============================================================


-- ============================================================
-- TEIL A – Zahlungsziel je Kunde
-- ============================================================
-- 0 bedeutet "zahlbar bei Erhalt": due_date = invoice_date,
-- die Rechnung ist also ab dem Folgetag ueberfaellig.

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS payment_days INT NOT NULL DEFAULT 14;

DO $$
BEGIN
  ALTER TABLE customers ADD CONSTRAINT customers_payment_days_check
    CHECK (payment_days >= 0 AND payment_days <= 365);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON COLUMN customers.payment_days IS
  'Vereinbartes Zahlungsziel in Tagen. 0 = zahlbar bei Erhalt. Steuert Fälligkeit und Überfälligkeit der Ausgangsrechnungen.';

-- Bestandskunden auf den bisher global gueltigen Wert setzen,
-- damit sich an vorhandenen Rechnungen nichts aendert.
UPDATE customers c
   SET payment_days = COALESCE(b.payment_days, 14)
  FROM client_branding b
 WHERE b.client_id = c.client_id
   AND c.payment_days = 14
   AND COALESCE(b.payment_days, 14) <> 14;


-- ============================================================
-- TEIL B – Ansprechpartner je Rechnung
-- ============================================================
-- Wird beim Anlegen aus customers.contact_person vorbelegt und
-- kann fuer die einzelne Rechnung ueberschrieben werden.

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS contact_person TEXT;

COMMENT ON COLUMN invoices.contact_person IS
  'Ansprechpartner für diese Rechnung ("z.H. …"). Vorbelegt aus customers.contact_person, pro Rechnung überschreibbar.';


-- ============================================================
-- KONTROLLE
-- ============================================================
--
--   SELECT name, payment_days,
--          CASE WHEN payment_days = 0 THEN 'bei Erhalt'
--               ELSE payment_days || ' Tage' END AS zahlungsziel
--   FROM customers ORDER BY name;
--
-- ============================================================
