ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS asset_id UUID REFERENCES assets(id) ON DELETE RESTRICT;

COMMENT ON COLUMN transactions.asset_id IS
  'AfA-Buchung: die Anlage, deren Jahres-Abschreibung diese Buchung ist. NULL bei allen anderen Buchungen. Eine Anlage mit AfA-Buchungen kann nicht gelöscht werden (zuerst AfA zurücknehmen).';

CREATE UNIQUE INDEX IF NOT EXISTS uq_transactions_afa_je_jahr
  ON transactions (asset_id, (EXTRACT(YEAR FROM booking_date)::int))
  WHERE asset_id IS NOT NULL;

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

INSERT INTO categories (name, type, vat_rate, konto_nr, is_system, sort_order)
SELECT 'Abschreibung (AfA)', 'expense', 0, '7010', TRUE, 206
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE konto_nr = '7010' AND tenant_id IS NULL);;
