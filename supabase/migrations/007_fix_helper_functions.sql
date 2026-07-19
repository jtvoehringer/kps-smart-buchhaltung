-- ============================================================
-- Migration 007 – Hilfsfunktionen auf SECURITY DEFINER setzen
-- Problem: get_my_role() / get_my_tenant_id() laufen ohne
-- SECURITY DEFINER → zirkuläre RLS-Deadlock → gibt NULL zurück
-- → kanzlei/admin sehen keine Clients (Policy = FALSE)
-- ============================================================

-- Hilfsfunktionen neu erstellen mit SECURITY DEFINER
-- Damit können sie public.users lesen ohne RLS-Blockade

CREATE OR REPLACE FUNCTION get_my_role()
RETURNS TEXT LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT role::text FROM public.users WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION get_my_tenant_id()
RETURNS UUID LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT tenant_id FROM public.users WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION get_my_client_ids()
RETURNS SETOF UUID LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT client_id FROM public.client_memberships WHERE user_id = auth.uid()
$$;

-- Sicherstellen dass authenticated-Rolle die Funktion aufrufen darf
GRANT EXECUTE ON FUNCTION get_my_client_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION get_my_role() TO authenticated;
GRANT EXECUTE ON FUNCTION get_my_tenant_id() TO authenticated;

-- Superadmin-Membership für jv@icp-consultants.at auf IC&P Consultants sicherstellen
-- (damit getMyClientId() direkt funktioniert ohne Sonderbehandlung)
INSERT INTO client_memberships (client_id, user_id, invited_by)
SELECT c.id, u.id, u.id
FROM clients c
CROSS JOIN users u
WHERE c.company_name = 'IC&P Consultants e.U.'
  AND u.email = 'jv@icp-consultants.at'
ON CONFLICT DO NOTHING;

-- ============================================================
-- ✅ Fertig. kanzlei/admin können jetzt Clients sehen.
--    jv@icp-consultants.at hat Membership auf IC&P Consultants.
-- ============================================================
