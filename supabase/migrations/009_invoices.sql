-- ============================================================
-- KPS Smart Buchhaltung – Migration 009
-- Rechnungsmodul: client_branding + customers + invoices
-- Ausführen in: Supabase → SQL Editor → Run
-- ============================================================

-- ============================================================
-- BRANDING: client_branding (Klientendesign für Rechnungen)
-- ============================================================
CREATE TABLE client_branding (
  client_id          UUID PRIMARY KEY REFERENCES clients(id) ON DELETE CASCADE,
  -- Visuelles Design
  logo_url           TEXT,                        -- Pfad in Supabase Storage: logos/{client_id}/logo.*
  brand_color        TEXT NOT NULL DEFAULT '#1B3A6B',  -- Hex-Farbe für Rechnungskopf
  -- Firmenadresse (für Rechnungskopf)
  company_street     TEXT,
  company_zip        TEXT,
  company_city       TEXT,
  company_country    TEXT NOT NULL DEFAULT 'Österreich',
  company_phone      TEXT,
  company_email      TEXT,
  company_website    TEXT,
  -- Bankverbindung (für Zahlungshinweis)
  iban               TEXT,
  bic                TEXT,
  bank_name          TEXT,
  -- Rechnungsnummern
  invoice_prefix     TEXT NOT NULL DEFAULT 'RE-',  -- z.B. "RE-", "2025-", "INV-"
  invoice_next_nr    INT  NOT NULL DEFAULT 1,       -- nächste laufende Nummer
  invoice_nr_digits  INT  NOT NULL DEFAULT 3        -- Nullauffüllung: 3 → 001, 4 → 0001
                       CHECK (invoice_nr_digits BETWEEN 1 AND 6),
  -- Zahlungsziel
  payment_days       INT  NOT NULL DEFAULT 14       -- Standard-Zahlungsziel in Tagen
                       CHECK (payment_days BETWEEN 0 AND 365),
  -- Fußzeile
  invoice_footer     TEXT,                          -- Freitext-Fußzeile (z.B. Steuerberater-Hinweis)
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE client_branding IS 'Klientenspezifisches Design für Ausgangsrechnungen. Unabhängig vom KPS App-Design.';
COMMENT ON COLUMN client_branding.invoice_prefix IS 'Prefix der Rechnungsnummer, z.B. RE- ergibt RE-001';
COMMENT ON COLUMN client_branding.invoice_next_nr IS 'Wird bei jeder finalisierten Rechnung hochgezählt';

-- ============================================================
-- KUNDENSTAMM: customers
-- ============================================================
CREATE TABLE customers (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id      UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  -- Stammdaten
  name           TEXT NOT NULL,
  company_name   TEXT,                    -- falls abweichend vom Namen (Firmenname)
  street         TEXT,
  zip            TEXT,
  city           TEXT,
  country        TEXT NOT NULL DEFAULT 'Österreich',
  -- Kontakt
  email          TEXT,
  phone          TEXT,
  -- Steuer
  uid_number     TEXT,                    -- UID des Kunden (für B2B-Rechnungen)
  -- Meta
  notes          TEXT,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE customers IS 'Kundenstammdaten je Klient. Kein CRM – nur für Rechnungsadressierung.';

CREATE INDEX idx_customers_client ON customers(client_id);
CREATE INDEX idx_customers_name   ON customers(client_id, name);

-- ============================================================
-- RECHNUNGEN: invoices
-- ============================================================
CREATE TABLE invoices (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id        UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  customer_id      UUID REFERENCES customers(id) ON DELETE SET NULL,
  -- Nummer & Datum
  invoice_number   TEXT NOT NULL,                  -- z.B. "RE-001", generiert beim Finalisieren
  invoice_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date         DATE NOT NULL,
  -- Status
  status           TEXT NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft','open','paid','cancelled')),
  -- Positionen (JSONB Array)
  -- Struktur: [{ description, quantity, unit, unit_price, vat_rate, amount_net, amount_vat, amount_gross }]
  items            JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Summen (denormalisiert für Performance & PDF)
  total_net        NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_vat        NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_gross      NUMERIC(12,2) NOT NULL DEFAULT 0,
  -- Zahlung
  paid_date        DATE,                            -- Zahlungsdatum (gesetzt wenn status=paid)
  -- Verknüpfung mit Buchhaltung
  transaction_id   UUID REFERENCES transactions(id) ON DELETE SET NULL,  -- Auto-Buchung
  -- Freitext
  notes            TEXT,                            -- Interne Notiz
  footer_override  TEXT,                            -- überschreibt client_branding.invoice_footer
  -- Meta
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, invoice_number)                -- Rechnungsnummer pro Klient eindeutig
);

COMMENT ON TABLE invoices IS 'Ausgangsrechnungen. draft=Entwurf, open=finalisiert+verbucht, paid=bezahlt, cancelled=storniert.';
COMMENT ON COLUMN invoices.items IS 'JSONB-Array der Rechnungspositionen: [{description, quantity, unit, unit_price, vat_rate, amount_net, amount_vat, amount_gross}]';
COMMENT ON COLUMN invoices.transaction_id IS 'Verknüpfte Buchung (Einnahme) – wird beim Finalisieren automatisch angelegt.';

CREATE INDEX idx_invoices_client  ON invoices(client_id);
CREATE INDEX idx_invoices_status  ON invoices(client_id, status);
CREATE INDEX idx_invoices_date    ON invoices(client_id, invoice_date);
CREATE INDEX idx_invoices_due     ON invoices(client_id, due_date) WHERE status = 'open';

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE client_branding ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers        ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices         ENABLE ROW LEVEL SECURITY;

-- client_branding: Klient liest/schreibt nur eigene
CREATE POLICY "Klient sieht eigenes Branding" ON client_branding
  FOR SELECT USING (client_id = get_my_client_id());

CREATE POLICY "Klient kann Branding verwalten" ON client_branding
  FOR ALL USING (client_id = get_my_client_id());

CREATE POLICY "Kanzlei sieht Branding aller Klienten" ON client_branding
  FOR SELECT USING (
    get_my_role() IN ('admin','kanzlei')
    AND client_id IN (SELECT id FROM clients WHERE tenant_id = get_my_tenant_id())
  );

-- customers: Klient verwaltet eigene Kunden
CREATE POLICY "Klient sieht eigene Kunden" ON customers
  FOR SELECT USING (client_id = get_my_client_id());

CREATE POLICY "Klient kann Kunden verwalten" ON customers
  FOR ALL USING (client_id = get_my_client_id());

CREATE POLICY "Kanzlei sieht Kunden aller Klienten" ON customers
  FOR SELECT USING (
    get_my_role() IN ('admin','kanzlei')
    AND client_id IN (SELECT id FROM clients WHERE tenant_id = get_my_tenant_id())
  );

-- invoices: Klient verwaltet eigene Rechnungen
CREATE POLICY "Klient sieht eigene Rechnungen" ON invoices
  FOR SELECT USING (client_id = get_my_client_id());

CREATE POLICY "Klient kann Rechnungen erstellen/bearbeiten" ON invoices
  FOR ALL USING (
    client_id = get_my_client_id()
    AND status IN ('draft','open','paid','cancelled')
  );

CREATE POLICY "Kanzlei sieht Rechnungen aller Klienten" ON invoices
  FOR SELECT USING (
    get_my_role() IN ('admin','kanzlei')
    AND client_id IN (SELECT id FROM clients WHERE tenant_id = get_my_tenant_id())
  );

-- ============================================================
-- TRIGGER: updated_at
-- ============================================================
CREATE TRIGGER trg_client_branding_updated_at
  BEFORE UPDATE ON client_branding
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_customers_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- SUPABASE STORAGE: logos Bucket
-- ============================================================
-- Manuell in Supabase Dashboard anlegen:
-- Storage → New Bucket → Name: "logos" → Public: JA
-- Damit sind Logo-URLs direkt per URL abrufbar (für PDF-Rendering)
--
-- RLS für Storage (in Supabase Dashboard → Storage → Policies):
-- INSERT: auth.uid() IS NOT NULL AND (storage.foldername(name))[1] = get_my_client_id()::text
-- SELECT: true (public)
-- DELETE: auth.uid() IS NOT NULL AND (storage.foldername(name))[1] = get_my_client_id()::text

-- ============================================================
-- FERTIG
-- ✅ client_branding, customers, invoices + RLS + Trigger
-- Nächster Schritt: Supabase Storage Bucket "logos" anlegen (public)
-- Dann: Einstellungen Rechnungsdesign-Sektion
-- ============================================================
