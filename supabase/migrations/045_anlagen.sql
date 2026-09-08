-- ============================================================
-- E&A Suite – Migration 045
-- Anlagenverzeichnis (assets)
--
-- Welle 7 (08.09.2026): Der Unternehmensbericht zeigt ein echtes
-- Anlagevermögen – Anschaffungskosten, Nutzungsdauer, AfA je Jahr,
-- Buchwert – statt bloßer Anschaffungswerte aus Kontenklasse 0.
--
-- Rechenregeln (Österreich, EStG § 7/§ 13) liegen in der Anwendung
-- (src/lib/anlagen.ts): lineare AfA, Halbjahresregel (Inbetriebnahme
-- im 2. Halbjahr → halbe Jahres-AfA im ersten Jahr, Rest am Ende),
-- degressive AfA optional (max. 30 %, Wechsel auf linear erlaubt),
-- geringwertige Wirtschaftsgüter (GWG) mit Sofortabschreibung.
--
-- Die Anschaffung selbst wird weiterhin als Buchung erfasst
-- (Kategorie der Kontenklasse 0, damit Vorsteuer und BMD-Export
-- stimmen); transaction_id verknüpft Anlage und Buchung.
--
-- Idempotent. Ausführen in: Supabase -> SQL Editor -> Run
-- ============================================================

CREATE TABLE IF NOT EXISTS assets (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id          UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name               TEXT NOT NULL,
  -- Anlagengruppe, frei wählbar (z. B. "Betriebs- und Geschäftsausstattung")
  asset_group        TEXT,
  -- Kontonummer der Kontenklasse 0 (z. B. 0660), informativ / für den Steuerberater
  konto_nr           TEXT,
  acquired_on        DATE NOT NULL,                       -- Anschaffung / Inbetriebnahme
  cost_net           NUMERIC(14,2) NOT NULL,              -- Anschaffungskosten netto
  useful_life_years  INTEGER NOT NULL DEFAULT 1,          -- Nutzungsdauer in Jahren
  method             TEXT NOT NULL DEFAULT 'linear',      -- 'linear' | 'degressiv' | 'gwg'
  degressive_rate    NUMERIC(5,2),                        -- nur bei degressiv, max. 30
  residual_value     NUMERIC(14,2) NOT NULL DEFAULT 0,    -- Erinnerungswert / Restwert
  disposed_on        DATE,                                -- Abgang (Verkauf, Verschrottung)
  disposal_proceeds  NUMERIC(14,2),                       -- Veräußerungserlös netto
  transaction_id     UUID REFERENCES transactions(id) ON DELETE SET NULL,
  notes              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT assets_kosten_positiv       CHECK (cost_net >= 0),
  CONSTRAINT assets_nutzungsdauer        CHECK (useful_life_years >= 1 AND useful_life_years <= 100),
  CONSTRAINT assets_methode              CHECK (method IN ('linear', 'degressiv', 'gwg')),
  CONSTRAINT assets_degressiv_satz       CHECK (degressive_rate IS NULL OR (degressive_rate > 0 AND degressive_rate <= 30)),
  CONSTRAINT assets_restwert             CHECK (residual_value >= 0 AND residual_value <= cost_net),
  CONSTRAINT assets_abgang_nach_zugang   CHECK (disposed_on IS NULL OR disposed_on >= acquired_on)
);

COMMENT ON TABLE assets IS
  'Anlagenverzeichnis: abnutzbares Anlagevermögen mit Anschaffungskosten, Nutzungsdauer und AfA-Methode. AfA-Plan und Buchwerte werden in der Anwendung berechnet (src/lib/anlagen.ts).';

CREATE INDEX IF NOT EXISTS idx_assets_client
  ON assets (client_id, acquired_on);

-- updated_at automatisch pflegen
CREATE OR REPLACE FUNCTION assets_set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_assets_updated_at ON assets;
CREATE TRIGGER trg_assets_updated_at
  BEFORE UPDATE ON assets
  FOR EACH ROW EXECUTE FUNCTION assets_set_updated_at();


ALTER TABLE assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Klient verwaltet eigene Anlagen" ON assets;
CREATE POLICY "Klient verwaltet eigene Anlagen" ON assets
  FOR ALL
  USING (client_id IN (SELECT get_my_client_ids()))
  WITH CHECK (
    client_id IN (SELECT get_my_client_ids())
    AND (transaction_id IS NULL
         OR transaction_id IN (SELECT id FROM transactions t WHERE t.client_id = assets.client_id))
  );

DROP POLICY IF EXISTS "Kanzlei liest Anlagen ihrer Mandanten" ON assets;
CREATE POLICY "Kanzlei liest Anlagen ihrer Mandanten" ON assets
  FOR SELECT USING (
    get_my_role() IN ('admin', 'kanzlei')
    AND client_id IN (SELECT id FROM clients WHERE tenant_id = get_my_tenant_id())
  );

DROP POLICY IF EXISTS "Superadmin: alle Anlagen" ON assets;
CREATE POLICY "Superadmin: alle Anlagen" ON assets
  FOR ALL USING (is_superadmin());


-- Standardkategorie für aktivierungspflichtige Anschaffungen (Kontenklasse 0):
-- Die Anschaffung wird damit gebucht (Vorsteuer, BMD-Export), im Bericht
-- als Anlagenzugang ausgewiesen und die AfA aus dem Anlagenverzeichnis
-- gerechnet – statt als laufende Ausgabe.
INSERT INTO categories (name, type, vat_rate, konto_nr, is_system, sort_order)
SELECT 'Anlagenkauf (aktivierungspflichtig)', 'expense', 20, '0660', TRUE, 205
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE konto_nr LIKE '0%' AND tenant_id IS NULL);


-- ============================================================
-- KONTROLLE
-- ============================================================
--   SELECT policyname, cmd FROM pg_policies WHERE tablename = 'assets' ORDER BY 1;
