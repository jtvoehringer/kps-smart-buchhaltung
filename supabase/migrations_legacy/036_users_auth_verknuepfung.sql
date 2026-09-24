-- ============================================================
-- KPS Smart Buchhaltung – Migration 036
-- public.users fest an auth.users binden
--
-- Behebt F-23:
--   public.users.id soll laut Kommentar der auth.users.id
--   entsprechen – erzwungen wurde das nirgends. Zwei Folgen:
--
--   1. Die Spalte hat DEFAULT uuid_generate_v4(). Ein INSERT ohne
--      id erzeugt also klaglos einen Datensatz mit einer erfundenen
--      Kennung. Der Nutzer existiert dann in der Anwendung, aber
--      auth.uid() liefert nie diesen Wert – jede RLS-Pruefung
--      schlaegt fehl. Das Konto ist dauerhaft leer und der Grund
--      nicht erkennbar.
--
--   2. Ohne Fremdschluessel bleibt beim Loeschen eines Zugangs in
--      Supabase Auth die Zeile in public.users stehen – samt Rolle
--      und Mandantenzuordnung. Beim naechsten Anlegen desselben
--      Mitarbeiters entsteht dann ein zweiter Datensatz mit
--      derselben E-Mail, was an users_email_key scheitert: der
--      Zugang laesst sich nicht mehr anlegen, ohne dass klar ist,
--      warum.
--
-- Idempotent. Ausfuehren in: Supabase -> SQL Editor -> Run
-- ============================================================


-- ============================================================
-- TEIL A – Bestand pruefen
-- ============================================================

DO $$
DECLARE
  v_verwaist INT;
BEGIN
  SELECT COUNT(*) INTO v_verwaist
  FROM public.users u
  WHERE NOT EXISTS (SELECT 1 FROM auth.users a WHERE a.id = u.id);

  IF v_verwaist > 0 THEN
    RAISE WARNING '% Benutzer in public.users haben keinen Zugang in auth.users. Diese Konten funktionieren nicht. Bitte prüfen: SELECT id, email, role FROM public.users u WHERE NOT EXISTS (SELECT 1 FROM auth.users a WHERE a.id = u.id);', v_verwaist;
  ELSE
    RAISE NOTICE 'Alle Benutzer haben einen passenden Auth-Zugang.';
  END IF;
END $$;


-- ============================================================
-- TEIL B – Erfundene Kennungen unmoeglich machen
-- ============================================================
-- Die id muss beim Anlegen aus auth.users kommen. Ein Vorgabewert
-- verdeckt genau den Fehler, den er zu verhindern scheint.

ALTER TABLE public.users ALTER COLUMN id DROP DEFAULT;

COMMENT ON COLUMN public.users.id IS
  'Muss der auth.users.id entsprechen – kein Vorgabewert, die Kennung kommt beim Anlegen aus Supabase Auth.';


-- ============================================================
-- TEIL C – Fremdschluessel
-- ============================================================
-- NOT VALID, damit die Migration auch bei bestehendem Altbestand
-- durchlaeuft; die Pruefung wird direkt danach versucht.

DO $$
BEGIN
  ALTER TABLE public.users
    ADD CONSTRAINT users_id_fkey
    FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE
    NOT VALID;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN insufficient_privilege THEN
    RAISE WARNING 'Kein Recht, einen Fremdschlüssel auf auth.users zu setzen. Bitte diesen Teil im Supabase-SQL-Editor als Eigentümer ausführen.';
END $$;

DO $$
BEGIN
  ALTER TABLE public.users VALIDATE CONSTRAINT users_id_fkey;
  RAISE NOTICE 'Fremdschlüssel auf auth.users ist scharf.';
EXCEPTION
  WHEN undefined_object THEN NULL;
  WHEN OTHERS THEN
    RAISE WARNING 'Fremdschlüssel konnte nicht geprüft werden (%). Er gilt ab sofort für neue Datensätze; der Bestand ist zu bereinigen.', SQLERRM;
END $$;


-- ============================================================
-- KONTROLLE
-- ============================================================
--   SELECT conname, convalidated FROM pg_constraint
--   WHERE conrelid = 'public.users'::regclass AND conname = 'users_id_fkey';
--
--   -- Muss 0 liefern:
--   SELECT count(*) FROM public.users u
--   WHERE NOT EXISTS (SELECT 1 FROM auth.users a WHERE a.id = u.id);
--
--   SELECT column_default FROM information_schema.columns
--   WHERE table_schema='public' AND table_name='users' AND column_name='id';
-- ============================================================
