CREATE TABLE IF NOT EXISTS assets (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id          UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name               TEXT NOT NULL,
  asset_group        TEXT,
  konto_nr           TEXT,
  acquired_on        DATE NOT NULL,
  cost_net           NUMERIC(14,2) NOT NULL,
  useful_life_years  INTEGER NOT NULL DEFAULT 1,
  method             TEXT NOT NULL DEFAULT 'linear',
  degressive_rate    NUMERIC(5,2),
  residual_value     NUMERIC(14,2) NOT NULL DEFAULT 0,
  disposed_on        DATE,
  disposal_proceeds  NUMERIC(14,2),
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
  FOR ALL USING (is_superadmin());;
