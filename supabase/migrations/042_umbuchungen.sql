-- ============================================================
-- KPS Smart Buchhaltung – Migration 042
-- Umbuchungen zwischen Konten
--
-- Vorgemerkt am 12.08.2026 („merks Dir"): Die Abbuchung des
-- Kreditkartensaldos vom Girokonto ist KEINE Ausgabe – die Ausgaben
-- stecken schon in den einzelnen Kreditkartenbuchungen. Sie ist eine
-- Umbuchung: Girokonto minus, Kreditkarte plus.
--
-- Deshalb eine EIGENE Tabelle statt einer weiteren transactions-Zeile:
-- UVA (uva_summe), E/A-Rechnung (monatssummen) und BMD-Export lesen
-- ausschließlich transactions und bleiben damit automatisch unberührt.
-- Sichtbar wird die Umbuchung nur in den Kontoabstimmungen BEIDER
-- Konten – abgestimmt wird je Seite getrennt, weil Girokonto- und
-- Kreditkartenauszug getrennt geprüft werden.
--
-- Idempotent. Ausfuehren in: Supabase -> SQL Editor -> Run
-- ============================================================

CREATE TABLE IF NOT EXISTS account_transfers (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id          UUID NOT NULL REFERENCES clients(id)  ON DELETE CASCADE,
  from_account_id    UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  to_account_id      UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  transfer_date      DATE NOT NULL,
  amount             NUMERIC(14,2) NOT NULL,
  description        TEXT,
  -- Je Kontoauszug ein eigenes Häkchen
  is_reconciled_from BOOLEAN NOT NULL DEFAULT FALSE,
  is_reconciled_to   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT account_transfers_betrag_positiv
    CHECK (amount > 0),
  CONSTRAINT account_transfers_verschiedene_konten
    CHECK (from_account_id <> to_account_id)
);

COMMENT ON TABLE account_transfers IS
  'Umbuchungen zwischen Konten (z. B. Ausgleich des Kreditkartensaldos vom Girokonto). Keine Einnahme/Ausgabe: zählt weder in UVA noch E/A-Rechnung noch BMD-Export. Erscheint in den Kontoabstimmungen beider Konten; je Seite ein eigenes Abgestimmt-Häkchen.';

CREATE INDEX IF NOT EXISTS idx_account_transfers_from
  ON account_transfers (from_account_id, transfer_date);
CREATE INDEX IF NOT EXISTS idx_account_transfers_to
  ON account_transfers (to_account_id, transfer_date);
CREATE INDEX IF NOT EXISTS idx_account_transfers_client
  ON account_transfers (client_id, transfer_date);


ALTER TABLE account_transfers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Klient verwaltet Umbuchungen eigener Konten" ON account_transfers;
CREATE POLICY "Klient verwaltet Umbuchungen eigener Konten" ON account_transfers
  FOR ALL
  USING (client_id IN (SELECT get_my_client_ids()))
  WITH CHECK (
    client_id IN (SELECT get_my_client_ids())
    -- Beide Konten müssen DEMSELBEN Mandanten gehören – sonst ließe
    -- sich ein fremdes Konto als Quelle oder Ziel eintragen.
    AND from_account_id IN (SELECT id FROM accounts a WHERE a.client_id = account_transfers.client_id)
    AND to_account_id   IN (SELECT id FROM accounts a WHERE a.client_id = account_transfers.client_id)
  );

DROP POLICY IF EXISTS "Kanzlei liest Umbuchungen ihrer Mandanten" ON account_transfers;
CREATE POLICY "Kanzlei liest Umbuchungen ihrer Mandanten" ON account_transfers
  FOR SELECT USING (
    get_my_role() IN ('admin', 'kanzlei')
    AND client_id IN (SELECT id FROM clients WHERE tenant_id = get_my_tenant_id())
  );

DROP POLICY IF EXISTS "Superadmin: alle Umbuchungen" ON account_transfers;
CREATE POLICY "Superadmin: alle Umbuchungen" ON account_transfers
  FOR ALL USING (is_superadmin());


-- ============================================================
-- KONTROLLE
-- ============================================================
--   SELECT policyname, cmd FROM pg_policies
--   WHERE tablename = 'account_transfers' ORDER BY 1;
--
--   -- Muss scheitern (gleiches Konto beidseitig):
--   -- INSERT INTO account_transfers (client_id, from_account_id, to_account_id, transfer_date, amount)
--   -- VALUES ('<client>', '<konto>', '<konto>', CURRENT_DATE, 100);
-- ============================================================
