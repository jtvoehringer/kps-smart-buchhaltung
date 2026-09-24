-- ============================================================
-- KPS Smart Buchhaltung – Migration 014
-- Eingangsrechnungen (Lieferantenrechnungen) für Offene Posten
-- Ausführen in: Supabase → SQL Editor → Run
-- ============================================================
-- Analog zu invoices (Ausgangsrechnungen, Migration 009): Eine Eingangs-
-- rechnung landet zunächst als "offen" in den Offenen Posten und wird erst
-- bei Zahlung (an diesem Tag) als Ausgabe in transactions verbucht.

CREATE TABLE incoming_invoices (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id          UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  category_id        UUID REFERENCES categories(id),   -- optionale Vorbelegung für die spätere Buchung
  -- Lieferant / Rechnung
  vendor_name        TEXT NOT NULL,
  invoice_number     TEXT,                              -- Rechnungsnummer des Lieferanten (nicht selbst vergeben)
  invoice_date       DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date           DATE NOT NULL,
  -- Beträge
  amount_net         NUMERIC(12,2) NOT NULL CHECK (amount_net >= 0),
  vat_rate           INT  NOT NULL DEFAULT 20 CHECK (vat_rate IN (0,10,13,20)),
  vat_amount         NUMERIC(12,2) NOT NULL DEFAULT 0,
  amount_gross       NUMERIC(12,2) GENERATED ALWAYS AS (amount_net + vat_amount) STORED,
  -- Status / Zahlung
  status             TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','paid','cancelled')),
  paid_date          DATE,
  transaction_id     UUID REFERENCES transactions(id) ON DELETE SET NULL,  -- Auto-Buchung bei Zahlung
  -- Beleg (optional bereits bei Erfassung hochgeladen, Supabase Storage Bucket "belege")
  beleg_storage_path TEXT,
  beleg_file_name    TEXT,
  beleg_mime_type    TEXT,
  beleg_file_size    BIGINT,
  -- Meta
  notes              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE incoming_invoices IS 'Eingangsrechnungen (Lieferantenrechnungen). open=offen/unbezahlt, paid=bezahlt+verbucht, cancelled=storniert. Wird erst bei Zahlung als Ausgabe (transactions) verbucht.';
COMMENT ON COLUMN incoming_invoices.transaction_id IS 'Verknüpfte Buchung (Ausgabe) – wird beim Als-bezahlt-Buchen automatisch angelegt.';

CREATE INDEX idx_incoming_invoices_client ON incoming_invoices(client_id);
CREATE INDEX idx_incoming_invoices_status ON incoming_invoices(client_id, status);
CREATE INDEX idx_incoming_invoices_due    ON incoming_invoices(client_id, due_date) WHERE status = 'open';

-- ============================================================
-- ROW LEVEL SECURITY (analog zu invoices, Migration 009)
-- ============================================================
ALTER TABLE incoming_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Klient sieht eigene Eingangsrechnungen" ON incoming_invoices
  FOR SELECT USING (client_id = get_my_client_id());

CREATE POLICY "Klient kann Eingangsrechnungen verwalten" ON incoming_invoices
  FOR ALL USING (client_id = get_my_client_id());

CREATE POLICY "Kanzlei sieht Eingangsrechnungen aller Klienten" ON incoming_invoices
  FOR SELECT USING (
    get_my_role() IN ('admin','kanzlei')
    AND client_id IN (SELECT id FROM clients WHERE tenant_id = get_my_tenant_id())
  );

CREATE POLICY "Kanzlei kann Eingangsrechnungen verwalten" ON incoming_invoices
  FOR ALL USING (
    get_my_role() IN ('admin','kanzlei')
    AND client_id IN (SELECT id FROM clients WHERE tenant_id = get_my_tenant_id())
  );

CREATE POLICY "Superadmin: alle Eingangsrechnungen" ON incoming_invoices
  FOR ALL USING (is_superadmin());

-- ============================================================
-- TRIGGER: updated_at
-- ============================================================
CREATE TRIGGER trg_incoming_invoices_updated_at
  BEFORE UPDATE ON incoming_invoices
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- FERTIG
-- ✅ incoming_invoices + RLS + Trigger
-- Nutzt den bestehenden Storage-Bucket "belege" für optionale Beleg-Uploads.
-- ============================================================
