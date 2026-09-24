-- ============================================================
-- KPS Smart Buchhaltung – Migration 015
-- Lieferanten-Stammdaten + Kleinunternehmerregelung/Regelbesteuerung
-- Ausführen in: Supabase → SQL Editor → Run
-- ============================================================

-- ------------------------------------------------------------
-- 1) Lieferanten-Stammdaten (analog zu customers, Migration 009)
-- ------------------------------------------------------------
CREATE TABLE suppliers (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id      UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  company_name   TEXT,
  street         TEXT,
  zip            TEXT,
  city           TEXT,
  country        TEXT NOT NULL DEFAULT 'Österreich',
  email          TEXT,
  phone          TEXT,
  uid_number     TEXT,
  iban           TEXT,
  notes          TEXT,
  is_active      BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE suppliers IS 'Lieferanten-Stammdaten. Eingangsrechnungen können optional per supplier_id verknüpft werden.';

CREATE INDEX idx_suppliers_client ON suppliers(client_id);

ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Klient sieht eigene Lieferanten" ON suppliers
  FOR SELECT USING (client_id = get_my_client_id());

CREATE POLICY "Klient kann Lieferanten verwalten" ON suppliers
  FOR ALL USING (client_id = get_my_client_id());

CREATE POLICY "Kanzlei sieht Lieferanten aller Klienten" ON suppliers
  FOR SELECT USING (
    get_my_role() IN ('admin','kanzlei')
    AND client_id IN (SELECT id FROM clients WHERE tenant_id = get_my_tenant_id())
  );

CREATE POLICY "Kanzlei kann Lieferanten verwalten" ON suppliers
  FOR ALL USING (
    get_my_role() IN ('admin','kanzlei')
    AND client_id IN (SELECT id FROM clients WHERE tenant_id = get_my_tenant_id())
  );

CREATE POLICY "Superadmin: alle Lieferanten" ON suppliers
  FOR ALL USING (is_superadmin());

CREATE TRIGGER trg_suppliers_updated_at
  BEFORE UPDATE ON suppliers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------
-- 2) Eingangsrechnungen optional mit Lieferanten-Stammdaten verknüpfen
--    (vendor_name bleibt als Freitext/Anzeige-Fallback erhalten)
-- ------------------------------------------------------------
ALTER TABLE incoming_invoices
  ADD COLUMN supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL;

CREATE INDEX idx_incoming_invoices_supplier ON incoming_invoices(supplier_id);

-- ------------------------------------------------------------
-- 3) Klientenstamm: Kleinunternehmerregelung / Regelbesteuerung
--    Rechtsgrundlage: § 6 Abs. 1 Z 27 UStG (Grenze seit 1.1.2025: 55.000 €,
--    Toleranzgrenze 60.500 €), Verzicht/Option zur Regelbesteuerung per
--    Formular U12, bindet für das Jahr der Abgabe + 4 weitere Kalenderjahre.
-- ------------------------------------------------------------
ALTER TABLE clients
  ADD COLUMN ust_status TEXT NOT NULL DEFAULT 'regelbesteuerung'
    CHECK (ust_status IN ('kleinunternehmer', 'regelbesteuerung')),
  ADD COLUMN regelbesteuerung_optiert BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN regelbesteuerung_options_jahr INT,
  ADD COLUMN regelbesteuerung_bindung_bis INT;

COMMENT ON COLUMN clients.ust_status IS
  'kleinunternehmer = umsatzsteuerbefreit nach § 6 Abs. 1 Z 27 UStG (Grenze 55.000 €, Toleranz 60.500 €); regelbesteuerung = normale USt-Pflicht.';
COMMENT ON COLUMN clients.regelbesteuerung_optiert IS
  'true = freiwilliger Verzicht auf die Kleinunternehmerbefreiung per Formular U12 (Regelbesteuerungsantrag), obwohl die Umsatzgrenze nicht überschritten ist.';
COMMENT ON COLUMN clients.regelbesteuerung_options_jahr IS
  'Kalenderjahr der Verzichtserklärung (U12). Bindungsfrist: dieses Jahr + 4 weitere Kalenderjahre.';
COMMENT ON COLUMN clients.regelbesteuerung_bindung_bis IS
  'Letztes Kalenderjahr der 5-jährigen Bindungsfrist (= regelbesteuerung_options_jahr + 4). Widerruf frühestens danach möglich.';

-- ------------------------------------------------------------
-- 4) OCR- und Rechnungsmodul sind ab sofort für alle Mandanten
--    fixer Bestandteil (nicht mehr optional zubuchbar). Bestehende
--    Datensätze werden zur Konsistenz nachgezogen; die Anwendung
--    selbst prüft modules_enabled für 'ocr'/'invoicing' nicht mehr.
-- ------------------------------------------------------------
UPDATE clients
SET modules_enabled = ARRAY(
  SELECT DISTINCT unnest(COALESCE(modules_enabled, ARRAY[]::text[]) || ARRAY['invoicing','ocr'])
);

-- ============================================================
-- FERTIG
-- ✅ suppliers + RLS + Trigger
-- ✅ incoming_invoices.supplier_id
-- ✅ clients.ust_status / regelbesteuerung_*
-- ✅ modules_enabled nachgezogen (invoicing/ocr für alle aktiv)
-- ============================================================
