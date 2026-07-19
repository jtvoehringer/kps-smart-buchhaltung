-- ============================================================
-- Migration 006 – Bugfixes
-- ============================================================

-- 1. Fehlende Superadmin-Policy auf client_memberships
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'client_memberships'
      AND policyname = 'Superadmin: alle Memberships'
  ) THEN
    CREATE POLICY "Superadmin: alle Memberships" ON client_memberships
      FOR ALL USING (is_superadmin());
  END IF;
END $$;

-- 2. Hilfsfunktion: Auth-User per E-Mail suchen (für addUserToMandant)
CREATE OR REPLACE FUNCTION get_auth_user_id_by_email(p_email TEXT)
RETURNS UUID LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT id FROM auth.users WHERE email = p_email LIMIT 1
$$;

-- 3. public.users-Einträge für Auth-User ohne Profil anlegen
--    (betrifft z.B. manuell erstellte Testuser)
INSERT INTO public.users (id, tenant_id, email, role)
SELECT
  au.id,
  (SELECT id FROM tenants ORDER BY created_at LIMIT 1),
  au.email,
  'klient'
FROM auth.users au
WHERE au.email NOT IN (SELECT email FROM public.users WHERE email IS NOT NULL)
  AND au.email IS NOT NULL
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- ✅ Fertig
-- ============================================================
