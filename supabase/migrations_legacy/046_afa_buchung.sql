-- ============================================================
-- E&A Suite – Migration 046
-- AfA-Buchung am Jahresende (Welle 8)
--
-- Die Abschreibung wird je Anlage und Jahr als Buchung erfasst:
-- Ausgabe in der Systemkategorie "Abschreibung (AfA)" (Konto 7010),
-- 0 % USt, ohne Zahlungskonto (nicht zahlungswirksam), per 31.12.
-- transactions.asset_id verknüpft die AfA-Buchung mit ihrer Anlage –
-- daran erkennt die Anwendung, was schon gebucht ist, und der
-- Unternehmensbericht zählt die AfA nicht doppelt.
--
-- Idempotent. Ausführen in: Supabase -> SQL Editor -> Run
-- ============================================================

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS asset_id UUID REFERENCES assets(id) ON DELETE RESTRICT;

COMMENT ON COLUMN transactions.asset_id IS
  'AfA-Buchung: die Anlage, deren Jahres-Abschreibung diese Buchung ist. NULL bei allen anderen Buchungen. Eine Anlage mit AfA-Buchungen kann nicht gelöscht werden (zuerst AfA zurücknehmen).';

-- Je Anlage und Jahr höchstens eine AfA-Buchung
CREATE UNIQUE INDEX IF NOT EXISTS uq_transactions_afa_je_jahr
  ON transactions (asset_id, (EXTRACT(YEAR FROM booking_date)::int))
  WHERE asset_id IS NOT NULL;

-- Die Anlage muss zum selben Betrieb gehören wie die Buchung
CREATE OR REPLACE FUNCTION check_transaction_asset_client() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.asset_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM assets a WHERE a.id = NEW.asset_id AND a.client_id = NEW.client_id
  ) THEN
    RAISE EXCEPTION 'Die Anlage gehört nicht zu diesem Betrieb.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_transactions_asset_client ON transactions;
CREATE TRIGGER trg_transactions_asset_client
  BEFORE INSERT OR UPDATE OF asset_id, client_id ON transactions
  FOR EACH ROW EXECUTE FUNCTION check_transaction_asset_client();


-- Systemkategorie für die Abschreibung (EKR 7010 Abschreibungen auf
-- Sachanlagen), ohne Umsatzsteuer – erscheint in Buchungsliste, UVA-
-- neutral (0 %) und im Steuerberater-Export.
INSERT INTO categories (name, type, vat_rate, konto_nr, is_system, sort_order)
SELECT 'Abschreibung (AfA)', 'expense', 0, '7010', TRUE, 206
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE konto_nr = '7010' AND tenant_id IS NULL);


-- ============================================================
-- KONTROLLE
-- ============================================================
--   SELECT id, name, konto_nr FROM categories WHERE konto_nr = '7010';
--   SELECT indexname FROM pg_indexes WHERE tablename = 'transactions' AND indexname = 'uq_transactions_afa_je_jahr';
