-- ============================================================
-- Migration 008 – Bankkonto-Import (CAMT.053 / CSV)
-- ============================================================

-- 1) transactions: Importspalten ergänzen
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS import_source TEXT NOT NULL DEFAULT 'manual'
    CHECK (import_source IN ('manual','camt053','csv')),
  ADD COLUMN IF NOT EXISTS bank_ref TEXT;  -- z.B. AcctSvcrRef aus CAMT.053

-- Deduplizierungs-Index: gleiche bank_ref pro Client nur einmal
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_bank_ref
  ON transactions(client_id, bank_ref)
  WHERE bank_ref IS NOT NULL;

-- 2) bank_imports: Import-History (eine Zeile pro Datei-Upload)
CREATE TABLE IF NOT EXISTS bank_imports (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  imported_by  UUID REFERENCES users(id),
  file_name    TEXT NOT NULL,
  file_type    TEXT NOT NULL CHECK (file_type IN ('camt053','csv')),
  iban         TEXT,
  tx_total     INT  NOT NULL DEFAULT 0,   -- Zeilen in der Datei
  tx_imported  INT  NOT NULL DEFAULT 0,   -- tatsächlich importiert (ohne Duplikate)
  imported_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bank_imports_client
  ON bank_imports(client_id, imported_at DESC);

-- RLS
ALTER TABLE bank_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Klient sieht eigene Imports" ON bank_imports
  FOR SELECT USING (client_id IN (SELECT get_my_client_ids()));

CREATE POLICY "Klient kann Imports anlegen" ON bank_imports
  FOR INSERT WITH CHECK (client_id IN (SELECT get_my_client_ids()));

CREATE POLICY "Superadmin: alle Imports" ON bank_imports
  FOR ALL USING (is_superadmin());

CREATE POLICY "Kanzlei sieht alle Imports" ON bank_imports
  FOR SELECT USING (
    get_my_role() IN ('admin','kanzlei')
    AND client_id IN (
      SELECT id FROM clients WHERE tenant_id = get_my_tenant_id()
    )
  );

-- ============================================================
-- ✅ Fertig. Bitte in Supabase SQL-Editor ausführen.
-- ============================================================
