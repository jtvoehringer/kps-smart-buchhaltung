-- ============================================================
-- Migration 005 – Superadmin-Rolle
-- Ausführen in: Supabase → SQL Editor → Run
-- ============================================================

-- 1. Role-Constraint erweitern
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin','kanzlei','klient','superadmin'));

-- 2. Hilfsfunktion: ist der aktuelle User ein Superadmin?
CREATE OR REPLACE FUNCTION is_superadmin()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'superadmin'
  )
$$;

-- 3. Superadmin-Policies (darf ALLES sehen und schreiben, cross-tenant)
CREATE POLICY "Superadmin: alle Tenants"      ON tenants              FOR ALL USING (is_superadmin());
CREATE POLICY "Superadmin: alle Users"        ON users                FOR ALL USING (is_superadmin());
CREATE POLICY "Superadmin: alle Clients"      ON clients              FOR ALL USING (is_superadmin());
CREATE POLICY "Superadmin: alle Kategorien"   ON categories           FOR ALL USING (is_superadmin());
CREATE POLICY "Superadmin: alle Buchungen"    ON transactions         FOR ALL USING (is_superadmin());
CREATE POLICY "Superadmin: alle Dauerauftr."  ON recurring_transactions FOR ALL USING (is_superadmin());
CREATE POLICY "Superadmin: alle UVA"          ON tax_returns          FOR ALL USING (is_superadmin());
CREATE POLICY "Superadmin: alle Belege"       ON attachments          FOR ALL USING (is_superadmin());

DO $$ BEGIN
  -- Nur ausführen wenn client_memberships bereits existiert (Migration 004)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'client_memberships') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE tablename = 'client_memberships'
        AND policyname = 'Superadmin: alle Memberships'
    ) THEN
      EXECUTE 'CREATE POLICY "Superadmin: alle Memberships" ON client_memberships FOR ALL USING (is_superadmin())';
    END IF;
  END IF;
END $$;

-- 4. IC&P System-Tenant sicherstellen (für den Superadmin-User)
INSERT INTO tenants (name, slug, plan, max_clients)
VALUES ('IC&P Consultants e.U.', 'icp-system', 'enterprise', 9999)
ON CONFLICT (slug) DO NOTHING;

-- 5. jv@icp-consultants.at in public.users anlegen oder auf superadmin setzen
DO $$
DECLARE
  v_auth_id  UUID;
  v_tenant_id UUID;
BEGIN
  -- Auth-User-ID holen
  SELECT id INTO v_auth_id
    FROM auth.users
   WHERE email = 'jv@icp-consultants.at'
   LIMIT 1;

  IF v_auth_id IS NULL THEN
    RAISE NOTICE 'Kein Auth-User mit jv@icp-consultants.at gefunden – übersprungen.';
    RETURN;
  END IF;

  -- System-Tenant-ID holen
  SELECT id INTO v_tenant_id FROM tenants WHERE slug = 'icp-system';

  -- Eintrag anlegen oder Rolle aktualisieren
  INSERT INTO public.users (id, tenant_id, email, full_name, role)
  VALUES (v_auth_id, v_tenant_id, 'jv@icp-consultants.at', 'Jörgen Vogt', 'superadmin')
  ON CONFLICT (id) DO UPDATE SET role = 'superadmin';

  RAISE NOTICE 'jv@icp-consultants.at → superadmin ✓';
END $$;

-- ============================================================
-- ✅ Superadmin-Rolle aktiv.
-- jv@icp-consultants.at hat nun cross-tenant Vollzugriff.
-- ============================================================
