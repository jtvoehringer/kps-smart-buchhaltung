-- Kunden-Health-Check: angemeldete Benutzer dürfen nur lesen (RLS: nur Superadmin).
-- Die Standardrechte des Projekts hatten authenticated beim Anlegen alle Rechte gegeben;
-- TRUNCATE würde RLS umgehen. Schreiben nur über die Service Role (POST /api/healthcheck).
REVOKE ALL ON TABLE public.healthcheck_laeufe FROM anon, authenticated;
GRANT SELECT ON TABLE public.healthcheck_laeufe TO authenticated;
