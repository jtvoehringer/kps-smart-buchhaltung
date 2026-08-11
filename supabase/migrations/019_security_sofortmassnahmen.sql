-- ============================================================
-- KPS Smart Buchhaltung – Migration 019
-- SOFORTMASSNAHMEN aus dem Code Review vom 11.08.2026
--
-- Behebt:
--   S-2  Rechte-Eskalation: jeder User konnte sich zum Superadmin machen
--   S-3  process_recurring_transactions() war per RPC für jeden aufrufbar
--   S-4  get_auth_user_id_by_email() erlaubte Auth-User-Enumeration
--   D-1  attachments.size_bytes heisst im Code file_size
--
-- Diese Migration ist idempotent und kann gefahrlos mehrfach laufen.
-- Ausfuehren in: Supabase -> SQL Editor -> Run
-- ============================================================


-- ============================================================
-- TEIL A – Rechte-Eskalation ueber die users-Tabelle schliessen  (S-2)
-- ============================================================
--
-- Problem: Die Policy "Eigenes Profil aenderbar" erlaubte UPDATE auf die
-- eigene users-Zeile ohne Spaltenbeschraenkung und ohne WITH CHECK. Da im
-- gesamten Migrationsbestand kein einziges REVOKE stand, galt die Supabase-
-- Default-Grant-Lage: die Rolle "authenticated" durfte public.users updaten.
-- Damit genuegte ein einziger Aufruf aus der Browser-Konsole:
--
--   supabase.from('users').update({ role: 'superadmin' }).eq('id', <eigene id>)
--
-- ... um Vollzugriff auf saemtliche Mandanten aller Kanzleien zu erhalten
-- (die Policies aus Migration 005 sind FOR ALL, also auch schreibend).
--
-- Loesung: Schreibrecht auf Spaltenebene beschraenken. Alle legitimen
-- Schreibzugriffe der App auf users laufen ueber createAdminClient()
-- (Service Role) in Server Actions und sind davon NICHT betroffen –
-- geprueft in kanzlei/benutzer/actions.ts und kanzlei/mandant/[id]/actions.ts.

-- A.1 – Pauschales UPDATE-Recht entziehen
REVOKE UPDATE ON public.users FROM authenticated;
REVOKE UPDATE ON public.users FROM anon;

-- A.2 – Nur die unkritischen Profilfelder wieder freigeben
GRANT UPDATE (full_name, language) ON public.users TO authenticated;

-- A.3 – Policy mit WITH CHECK neu anlegen (verhindert das Umschreiben
--       der eigenen Zeile auf eine fremde id)
DROP POLICY IF EXISTS "Eigenes Profil änderbar" ON public.users;
CREATE POLICY "Eigenes Profil änderbar" ON public.users
  FOR UPDATE
  USING      (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- A.4 – Defense in Depth: Trigger, der Rollen- und Tenant-Wechsel aus einem
--       Client-Kontext heraus generell abweist. Greift nur, wenn die aktive
--       Postgres-Rolle 'authenticated' oder 'anon' ist. Service Role,
--       postgres und der SQL-Editor laufen ungehindert durch, damit die
--       Benutzerverwaltung der Kanzlei weiter funktioniert.
CREATE OR REPLACE FUNCTION prevent_privilege_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_setting('role', true) IN ('authenticated', 'anon') THEN
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'Die Rolle kann nicht über die Client-API geändert werden.';
    END IF;
    IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
      RAISE EXCEPTION 'Die Kanzlei-Zuordnung kann nicht über die Client-API geändert werden.';
    END IF;
    IF NEW.id IS DISTINCT FROM OLD.id THEN
      RAISE EXCEPTION 'Die Benutzer-ID kann nicht geändert werden.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_users_prevent_escalation ON public.users;
CREATE TRIGGER trg_users_prevent_escalation
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION prevent_privilege_escalation();

COMMENT ON FUNCTION prevent_privilege_escalation() IS
  'Verhindert Rollen-/Tenant-Wechsel aus Client-Kontext. Service Role bleibt unberührt.';


-- ============================================================
-- TEIL B – SECURITY-DEFINER-Funktionen absichern            (S-3, S-4)
-- ============================================================
--
-- Postgres vergibt EXECUTE auf neue Funktionen per Default an PUBLIC, und
-- PostgREST exponiert jede Funktion im public-Schema als
-- POST /rest/v1/rpc/<name>. Beide Funktionen unten laufen als SECURITY
-- DEFINER ohne jede Berechtigungspruefung im Funktionskoerper.

-- B.1 – process_recurring_transactions()  (S-3)
--       Iteriert ueber ALLE Dauerauftraege ALLER Mandanten und erzeugt
--       Buchungen. Wurde bisher von jedem eingeloggten Nutzer aufrufbar.
--       pg_cron laeuft als 'postgres' und braucht das Grant nicht.
REVOKE ALL ON FUNCTION public.process_recurring_transactions() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.process_recurring_transactions() FROM anon;
REVOKE ALL ON FUNCTION public.process_recurring_transactions() FROM authenticated;
ALTER FUNCTION public.process_recurring_transactions() SET search_path = public, pg_temp;

-- B.2 – get_auth_user_id_by_email()  (S-4)
--       Loest eine beliebige E-Mail-Adresse in die auth.users.id auf.
--       Wird ausschliesslich mit dem Admin-Client aufgerufen
--       (kanzlei/mandant/[id]/actions.ts) – authenticated braucht es nicht.
REVOKE ALL ON FUNCTION public.get_auth_user_id_by_email(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_auth_user_id_by_email(TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.get_auth_user_id_by_email(TEXT) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.get_auth_user_id_by_email(TEXT) TO service_role;
ALTER FUNCTION public.get_auth_user_id_by_email(TEXT) SET search_path = public, auth, pg_temp;

-- B.3 – search_path der uebrigen Helferfunktionen haerten.
--       Diese bleiben fuer authenticated aufrufbar (die RLS-Policies
--       brauchen sie), bekommen aber einen festen Suchpfad – das ist
--       genau, was der Supabase-Linter unter
--       "function_search_path_mutable" bemaengelt.
ALTER FUNCTION public.is_superadmin()        SET search_path = public, pg_temp;
ALTER FUNCTION public.get_my_role()          SET search_path = public, pg_temp;
ALTER FUNCTION public.get_my_tenant_id()     SET search_path = public, pg_temp;
ALTER FUNCTION public.get_my_client_ids()    SET search_path = public, pg_temp;

-- get_my_client_id() existiert nur, wenn Migration 004 gelaufen ist
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_my_client_id'
  ) THEN
    EXECUTE 'ALTER FUNCTION public.get_my_client_id() SET search_path = public, pg_temp';
  END IF;
END $$;


-- ============================================================
-- TEIL C – attachments.size_bytes -> file_size                   (D-1)
-- ============================================================
--
-- Migration 001 legt die Spalte als size_bytes an. Der Anwendungscode
-- schreibt an drei Stellen file_size (BelegUpload.tsx:74,
-- BuchungForm.tsx:226, OffenePostenClient.tsx:194); der String
-- "size_bytes" kommt in src/ kein einziges Mal vor.
--
-- Wirkung bisher: Der Storage-Upload gelingt, der anschliessende
-- attachments-Insert scheitert mit PGRST204. In BuchungForm und
-- OffenePostenClient wird dieser Fehler nicht ausgewertet – die Datei
-- liegt im Storage, der Datenbankeintrag fehlt, der Beleg ist
-- unauffindbar.
--
-- Idempotent: benennt nur um, wenn size_bytes noch existiert. Falls die
-- Spalte bereits ueber das Dashboard umbenannt wurde, passiert nichts.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'attachments'
      AND column_name  = 'size_bytes'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'attachments'
      AND column_name  = 'file_size'
  ) THEN
    ALTER TABLE public.attachments RENAME COLUMN size_bytes TO file_size;
    RAISE NOTICE 'attachments.size_bytes wurde in file_size umbenannt.';
  ELSE
    RAISE NOTICE 'attachments: keine Umbenennung noetig (file_size existiert bereits oder size_bytes fehlt).';
  END IF;
END $$;


-- ============================================================
-- KONTROLLE – nach dem Ausfuehren pruefen
-- ============================================================
--
-- Erwartet: KEINE Zeile mit grantee 'authenticated' und privilege 'UPDATE'
-- ausser fuer full_name und language.
--
--   SELECT grantee, privilege_type, column_name
--   FROM information_schema.column_privileges
--   WHERE table_name = 'users' AND grantee IN ('authenticated','anon')
--     AND privilege_type = 'UPDATE'
--   ORDER BY column_name;
--
-- Erwartet: leer (keine EXECUTE-Rechte fuer anon/authenticated)
--
--   SELECT p.proname, r.rolname
--   FROM pg_proc p
--   JOIN pg_namespace n ON n.oid = p.pronamespace
--   CROSS JOIN (VALUES ('anon'),('authenticated')) AS r(rolname)
--   WHERE n.nspname = 'public'
--     AND p.proname IN ('process_recurring_transactions','get_auth_user_id_by_email')
--     AND has_function_privilege(r.rolname, p.oid, 'EXECUTE');
--
-- Erwartet: file_size
--
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'attachments' AND column_name IN ('size_bytes','file_size');
--
-- ============================================================
-- Fertig. Danach Migration 020 (Storage-Policies) ausfuehren.
-- ============================================================
