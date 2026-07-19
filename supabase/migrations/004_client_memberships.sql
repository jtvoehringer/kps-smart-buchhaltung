-- ============================================================
-- KPS Smart Buchhaltung – Migration 004
-- Multi-User pro Mandant via client_memberships
-- ============================================================

-- n:m-Tabelle: welche User haben Zugriff auf welchen Mandanten
CREATE TABLE IF NOT EXISTS client_memberships (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id  UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  invited_by UUID            REFERENCES users(id),
  created_at TIMESTAMPTZ     NOT NULL DEFAULT now(),
  UNIQUE(client_id, user_id)
);

COMMENT ON TABLE client_memberships IS
  'Verbindet Users mit Mandanten (n:m). Ersetzt clients.user_id für Zugriffssteuerung.';

-- Index für schnelle Lookups
CREATE INDEX idx_memberships_user   ON client_memberships(user_id);
CREATE INDEX idx_memberships_client ON client_memberships(client_id);

-- Bestehende Verknüpfungen migrieren (clients.user_id → memberships)
INSERT INTO client_memberships (client_id, user_id)
SELECT id, user_id
FROM clients
WHERE user_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- get_my_client_id() nun über Memberships
CREATE OR REPLACE FUNCTION get_my_client_id()
RETURNS UUID LANGUAGE sql STABLE AS $$
  SELECT client_id
  FROM client_memberships
  WHERE user_id = auth.uid()
  LIMIT 1
$$;

-- Neue Funktion: alle client_ids des eingeloggten Users (für Multi-Mandant)
CREATE OR REPLACE FUNCTION get_my_client_ids()
RETURNS SETOF UUID LANGUAGE sql STABLE AS $$
  SELECT client_id
  FROM client_memberships
  WHERE user_id = auth.uid()
$$;

-- ── RLS für client_memberships ──────────────────────────────
ALTER TABLE client_memberships ENABLE ROW LEVEL SECURITY;

-- Klient sieht eigene Memberships
CREATE POLICY "Klient sieht eigene Memberships" ON client_memberships
  FOR SELECT USING (user_id = auth.uid());

-- Kanzlei/Admin sieht alle Memberships im Tenant
CREATE POLICY "Kanzlei sieht alle Memberships" ON client_memberships
  FOR SELECT USING (
    get_my_role() IN ('admin','kanzlei')
    AND client_id IN (
      SELECT id FROM clients WHERE tenant_id = get_my_tenant_id()
    )
  );

-- Kanzlei/Admin kann Memberships anlegen und löschen
CREATE POLICY "Kanzlei verwaltet Memberships" ON client_memberships
  FOR ALL USING (
    get_my_role() IN ('admin','kanzlei')
    AND client_id IN (
      SELECT id FROM clients WHERE tenant_id = get_my_tenant_id()
    )
  );

-- ── clients RLS: "Klient sieht nur sich selbst" ersetzen ────
DROP POLICY IF EXISTS "Klient sieht nur sich selbst" ON clients;

CREATE POLICY "Klient sieht eigene Clients" ON clients
  FOR SELECT USING (
    id IN (SELECT get_my_client_ids())
  );
