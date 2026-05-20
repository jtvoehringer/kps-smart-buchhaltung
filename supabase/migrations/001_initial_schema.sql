-- ============================================================
-- KPS Smart Buchhaltung – Initiales Datenbankschema
-- Migration 001 – Alle Kerntabellen + RLS
-- Ausführen in: Supabase → SQL Editor → Run
-- ============================================================

-- Aktiviere UUID-Erweiterung
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- EBENE 1: tenants  (eine Zeile pro Kanzlei, z.B. KPS)
-- ============================================================
CREATE TABLE tenants (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name           TEXT NOT NULL,
  slug           TEXT NOT NULL UNIQUE,          -- z.B. "kps"
  plan           TEXT NOT NULL DEFAULT 'starter'
                   CHECK (plan IN ('starter','standard','professional','enterprise')),
  max_clients    INT  NOT NULL DEFAULT 15,
  active_until   DATE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE tenants IS 'Eine Zeile pro Kanzlei (z.B. KPS). Wird von IC&P verwaltet.';

-- ============================================================
-- EBENE 2: users  (Kanzlei-Admins & Klienten-Logins)
-- ============================================================
CREATE TABLE users (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email          TEXT NOT NULL UNIQUE,
  full_name      TEXT,
  role           TEXT NOT NULL DEFAULT 'klient'
                   CHECK (role IN ('admin','kanzlei','klient')),
  language       TEXT NOT NULL DEFAULT 'de' CHECK (language IN ('de','en')),
  last_login     TIMESTAMPTZ,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE users IS 'Alle Nutzer. role=admin ist IC&P, role=kanzlei ist KPS-Mitarbeiter, role=klient ist Endnutzer.';
COMMENT ON COLUMN users.id IS 'Entspricht der Supabase Auth user_id (auth.users.id).';

-- ============================================================
-- EBENE 2: clients  (ein Klient = ein EA-Rechner-Betrieb)
-- ============================================================
CREATE TABLE clients (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id          UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_name       TEXT NOT NULL,
  uid_number         TEXT,                        -- ATU-Nummer
  vat_liable         BOOLEAN NOT NULL DEFAULT TRUE,
  vat_period         TEXT NOT NULL DEFAULT 'quarterly'
                       CHECK (vat_period IN ('monthly','quarterly')),
  fiscal_year_start  INT  NOT NULL DEFAULT 1      -- 1 = Jänner
                       CHECK (fiscal_year_start BETWEEN 1 AND 12),
  is_active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, user_id)
);

COMMENT ON TABLE clients IS 'Stammdaten je Klient/Betrieb. Ein User hat genau einen Client-Eintrag.';

-- ============================================================
-- HILFSTABELLE: categories  (Einnahmen-/Ausgabenkategorien)
-- ============================================================
CREATE TABLE categories (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id    UUID REFERENCES tenants(id) ON DELETE CASCADE,  -- NULL = System-Kategorie
  name         TEXT NOT NULL,
  type         TEXT NOT NULL CHECK (type IN ('income','expense')),
  vat_rate     INT  NOT NULL DEFAULT 20 CHECK (vat_rate IN (0,10,13,20)),
  konto_nr     TEXT,                               -- Kontonummer aus Einnahmen-Ausgaben-Schema
  is_system    BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order   INT  NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE categories IS 'tenant_id NULL = Systemkategorie (für alle). Sonst kanzleispezifisch.';

-- Standard-Kategorien (Systemweit, tenant_id = NULL)
INSERT INTO categories (name, type, vat_rate, konto_nr, is_system, sort_order) VALUES
  -- Einnahmen
  ('Erlöse 20% USt',           'income',  20, '4000', TRUE,  10),
  ('Erlöse 10% USt',           'income',  10, '4010', TRUE,  20),
  ('Erlöse 13% USt',           'income',  13, '4020', TRUE,  30),
  ('Erlöse steuerfrei',        'income',   0, '4100', TRUE,  40),
  ('Sonstige Einnahmen',       'income',   0, '4900', TRUE,  50),
  -- Ausgaben
  ('Wareneinkauf 20% VSt',     'expense', 20, '5000', TRUE, 110),
  ('Wareneinkauf 10% VSt',     'expense', 10, '5010', TRUE, 120),
  ('Miete & Pacht',            'expense',  0, '7400', TRUE, 130),
  ('Büromaterial',             'expense', 20, '7200', TRUE, 140),
  ('Telefon & Internet',       'expense', 20, '7210', TRUE, 150),
  ('KFZ-Kosten',               'expense', 20, '7300', TRUE, 160),
  ('Versicherungen',           'expense',  0, '7500', TRUE, 170),
  ('Steuerberatungskosten',    'expense', 20, '7600', TRUE, 180),
  ('Personalkosten',           'expense',  0, '6000', TRUE, 190),
  ('Sonstige Ausgaben',        'expense', 20, '7900', TRUE, 200);

-- ============================================================
-- KERN: transactions  (jede einzelne Buchung)
-- ============================================================
CREATE TABLE transactions (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id      UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  category_id    UUID NOT NULL REFERENCES categories(id),
  recurring_id   UUID,                             -- FK wird nach recurring_transactions hinzugefügt
  type           TEXT NOT NULL CHECK (type IN ('income','expense')),
  amount_net     NUMERIC(12,2) NOT NULL CHECK (amount_net >= 0),
  vat_rate       INT  NOT NULL DEFAULT 0 CHECK (vat_rate IN (0,10,13,20)),
  vat_amount     NUMERIC(12,2) NOT NULL DEFAULT 0,
  amount_gross   NUMERIC(12,2) GENERATED ALWAYS AS (amount_net + vat_amount) STORED,
  booking_date   DATE NOT NULL,
  description    TEXT,
  is_locked      BOOLEAN NOT NULL DEFAULT FALSE,   -- TRUE nach UVA-Übermittlung
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON COLUMN transactions.is_locked    IS 'Wird TRUE wenn UVA für diesen Monat übermittelt wurde. Keine Änderungen mehr möglich.';
COMMENT ON COLUMN transactions.amount_gross IS 'Automatisch berechnet: amount_net + vat_amount.';

-- ============================================================
-- KERN: recurring_transactions  (Daueraufträge)
-- ============================================================
CREATE TABLE recurring_transactions (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id      UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  category_id    UUID NOT NULL REFERENCES categories(id),
  name           TEXT NOT NULL,                    -- z.B. "Miete Büro"
  type           TEXT NOT NULL CHECK (type IN ('income','expense')),
  amount_net     NUMERIC(12,2) NOT NULL CHECK (amount_net >= 0),
  vat_rate       INT  NOT NULL DEFAULT 0 CHECK (vat_rate IN (0,10,13,20)),
  interval       TEXT NOT NULL DEFAULT 'monthly'
                   CHECK (interval IN ('monthly','quarterly','semi-annual','annual')),
  day_of_month   INT  NOT NULL DEFAULT 1 CHECK (day_of_month BETWEEN 1 AND 28),
  next_run_date  DATE NOT NULL,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE recurring_transactions IS 'Daueraufträge. Werden automatisch zu transactions konvertiert (Cron-Job via Supabase Edge Function).';

-- Fremdschlüssel von transactions → recurring_transactions (nachträglich)
ALTER TABLE transactions
  ADD CONSTRAINT fk_transactions_recurring
  FOREIGN KEY (recurring_id) REFERENCES recurring_transactions(id) ON DELETE SET NULL;

-- ============================================================
-- STEUER: tax_returns  (UVA – Umsatzsteuervoranmeldung)
-- ============================================================
CREATE TABLE tax_returns (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id        UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  period_year      INT  NOT NULL,
  period_month     INT  NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  -- Bemessungsgrundlagen je Steuersatz
  tax_base_20      NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_base_13      NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_base_10      NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_base_0       NUMERIC(12,2) NOT NULL DEFAULT 0,
  -- Steuern
  vat_20           NUMERIC(12,2) NOT NULL DEFAULT 0,  -- tax_base_20 * 0.20
  vat_13           NUMERIC(12,2) NOT NULL DEFAULT 0,
  vat_10           NUMERIC(12,2) NOT NULL DEFAULT 0,
  input_tax        NUMERIC(12,2) NOT NULL DEFAULT 0,  -- Vorsteuer (aus Ausgaben)
  vat_payable      NUMERIC(12,2) NOT NULL DEFAULT 0,  -- Zahllast (positiv = zahlen, negativ = Guthaben)
  -- Workflow
  status           TEXT NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft','signed','submitted')),
  signed_at        TIMESTAMPTZ,
  submitted_at     TIMESTAMPTZ,
  fo_reference_nr  TEXT,                              -- FinanzOnline Referenznummer
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, period_year, period_month)       -- pro Klient nur eine UVA pro Monat
);

COMMENT ON TABLE tax_returns IS 'UVA (Umsatzsteuervoranmeldung). Status: draft → signed (ID Austria) → submitted (FinanzOnline).';

-- ============================================================
-- DATEIEN: attachments  (Belege zu Buchungen)
-- ============================================================
CREATE TABLE attachments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transaction_id  UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  client_id       UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  uploaded_by     UUID NOT NULL REFERENCES users(id),
  file_name       TEXT NOT NULL,
  storage_path    TEXT NOT NULL,                    -- Pfad in Azure Blob / Supabase Storage
  mime_type       TEXT NOT NULL,
  size_bytes      BIGINT NOT NULL DEFAULT 0,
  uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE attachments IS 'Belege (PDF, JPG, PNG) zu Buchungen. Gespeichert in Supabase Storage.';

-- ============================================================
-- INDIZES (Performance)
-- ============================================================
CREATE INDEX idx_users_tenant          ON users(tenant_id);
CREATE INDEX idx_clients_tenant        ON clients(tenant_id);
CREATE INDEX idx_transactions_client   ON transactions(client_id);
CREATE INDEX idx_transactions_date     ON transactions(client_id, booking_date);
CREATE INDEX idx_transactions_category ON transactions(category_id);
CREATE INDEX idx_recurring_client      ON recurring_transactions(client_id);
CREATE INDEX idx_recurring_next_run    ON recurring_transactions(next_run_date) WHERE is_active = TRUE;
CREATE INDEX idx_tax_returns_client    ON tax_returns(client_id, period_year, period_month);
CREATE INDEX idx_attachments_tx        ON attachments(transaction_id);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================
ALTER TABLE tenants              ENABLE ROW LEVEL SECURITY;
ALTER TABLE users                ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients              ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories           ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurring_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_returns          ENABLE ROW LEVEL SECURITY;
ALTER TABLE attachments          ENABLE ROW LEVEL SECURITY;

-- Hilfsfunktion: tenant_id des eingeloggten Users
CREATE OR REPLACE FUNCTION get_my_tenant_id()
RETURNS UUID LANGUAGE sql STABLE AS $$
  SELECT tenant_id FROM users WHERE id = auth.uid()
$$;

-- Hilfsfunktion: role des eingeloggten Users
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS TEXT LANGUAGE sql STABLE AS $$
  SELECT role FROM users WHERE id = auth.uid()
$$;

-- Hilfsfunktion: client_id des eingeloggten Users (falls Klient)
CREATE OR REPLACE FUNCTION get_my_client_id()
RETURNS UUID LANGUAGE sql STABLE AS $$
  SELECT id FROM clients WHERE user_id = auth.uid()
$$;

-- RLS-Policies: tenants (nur eigener Mandant sichtbar)
CREATE POLICY "Eigener Tenant sichtbar" ON tenants
  FOR SELECT USING (id = get_my_tenant_id());

-- RLS-Policies: users (nur eigener Tenant)
CREATE POLICY "Users im eigenen Tenant" ON users
  FOR SELECT USING (tenant_id = get_my_tenant_id());

CREATE POLICY "Eigenes Profil änderbar" ON users
  FOR UPDATE USING (id = auth.uid());

-- RLS-Policies: clients
CREATE POLICY "Kanzlei sieht alle Clients" ON clients
  FOR SELECT USING (
    tenant_id = get_my_tenant_id()
    AND get_my_role() IN ('admin','kanzlei')
  );

CREATE POLICY "Klient sieht nur sich selbst" ON clients
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Kanzlei kann Clients verwalten" ON clients
  FOR ALL USING (
    tenant_id = get_my_tenant_id()
    AND get_my_role() IN ('admin','kanzlei')
  );

-- RLS-Policies: categories (Systemkategorien + eigene)
CREATE POLICY "Kategorien lesen" ON categories
  FOR SELECT USING (
    tenant_id IS NULL                        -- System-Kategorien
    OR tenant_id = get_my_tenant_id()        -- Kanzlei-eigene
  );

CREATE POLICY "Kanzlei kann Kategorien verwalten" ON categories
  FOR ALL USING (
    tenant_id = get_my_tenant_id()
    AND get_my_role() IN ('admin','kanzlei')
  );

-- RLS-Policies: transactions
CREATE POLICY "Klient sieht eigene Buchungen" ON transactions
  FOR SELECT USING (client_id = get_my_client_id());

CREATE POLICY "Klient kann buchen" ON transactions
  FOR INSERT WITH CHECK (
    client_id = get_my_client_id()
    AND NOT is_locked
  );

CREATE POLICY "Klient kann unlocked Buchungen ändern" ON transactions
  FOR UPDATE USING (
    client_id = get_my_client_id()
    AND NOT is_locked
  );

CREATE POLICY "Kanzlei sieht alle Buchungen" ON transactions
  FOR SELECT USING (
    get_my_role() IN ('admin','kanzlei')
    AND client_id IN (
      SELECT id FROM clients WHERE tenant_id = get_my_tenant_id()
    )
  );

-- RLS-Policies: recurring_transactions
CREATE POLICY "Klient sieht eigene Daueraufträge" ON recurring_transactions
  FOR SELECT USING (client_id = get_my_client_id());

CREATE POLICY "Klient kann Daueraufträge verwalten" ON recurring_transactions
  FOR ALL USING (client_id = get_my_client_id());

-- RLS-Policies: tax_returns
CREATE POLICY "Klient sieht eigene UVA" ON tax_returns
  FOR SELECT USING (client_id = get_my_client_id());

CREATE POLICY "Klient kann UVA erstellen/ändern (nur draft)" ON tax_returns
  FOR ALL USING (
    client_id = get_my_client_id()
    AND status = 'draft'
  );

CREATE POLICY "Kanzlei sieht alle UVA" ON tax_returns
  FOR SELECT USING (
    get_my_role() IN ('admin','kanzlei')
    AND client_id IN (
      SELECT id FROM clients WHERE tenant_id = get_my_tenant_id()
    )
  );

-- RLS-Policies: attachments
CREATE POLICY "Klient sieht eigene Belege" ON attachments
  FOR SELECT USING (client_id = get_my_client_id());

CREATE POLICY "Klient kann Belege hochladen" ON attachments
  FOR INSERT WITH CHECK (client_id = get_my_client_id());

-- ============================================================
-- TRIGGER: updated_at automatisch setzen
-- ============================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_tenants_updated_at
  BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_transactions_updated_at
  BEFORE UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_tax_returns_updated_at
  BEFORE UPDATE ON tax_returns
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- FERTIG
-- ✅ Schema, RLS, Standardkategorien und Trigger sind angelegt.
-- Nächster Schritt: 002_edge_function_recurring.sql
-- ============================================================
