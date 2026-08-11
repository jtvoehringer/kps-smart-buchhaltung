-- ============================================================
-- KPS Smart Buchhaltung – Migration 033
-- Mandantenzuordnung eindeutig machen
--
-- Behebt F-18:
--   get_my_client_id() lautet
--
--     SELECT client_id FROM client_memberships
--     WHERE user_id = auth.uid() LIMIT 1
--
--   – ein LIMIT 1 ohne ORDER BY. Welche Zeile Postgres liefert, ist
--   nicht festgelegt und kann sich zwischen zwei Abfragen derselben
--   Anfrage aendern, etwa nach einem VACUUM oder wenn der Planer den
--   Zugriffspfad wechselt.
--
--   Auf dieser Funktion steht die gesamte Sichtbarkeit fuer die Rolle
--   "Klient": Buchungen, Rechnungen, Kunden, Lieferanten, Belege,
--   Daueraufträge, UVA, Branding, Konten, Lernregeln,
--   Monatsabschluesse. Wer zu zwei Mandanten gehoert – jemand mit
--   Einzelunternehmen und GmbH, ein Kanzleimitarbeiter mit eigenem
--   Betrieb –, sieht die Daten eines zufaellig gewaehlten Mandanten.
--   Im schlimmsten Fall waehlt derselbe Request beim Lesen den einen
--   und beim Schreiben den anderen: die Buchung landet dann beim
--   falschen Mandanten.
--
--   Richtig ist: man sieht alle Mandanten, denen man zugeordnet ist.
--   Genau das leistet get_my_client_ids(), das Storage-Policies und
--   neuere Migrationen ohnehin schon verwenden.
--
-- Idempotent. Ausfuehren in: Supabase -> SQL Editor -> Run
-- ============================================================


-- ============================================================
-- TEIL A – Alle betroffenen Policies umschreiben
-- ============================================================
-- Die Policies werden aus dem Katalog gelesen und mit derselben
-- Bedingung neu angelegt – nur "= get_my_client_id()" wird zu
-- "IN (SELECT get_my_client_ids())". Alles andere an der Bedingung
-- bleibt unangetastet, damit Zusaetze wie "AND NOT is_locked" oder
-- "AND status = 'draft'" erhalten bleiben.
--
-- Trifft eine Policy auf ein unerwartetes Muster, wird sie gemeldet
-- und in Ruhe gelassen, statt sie auf gut Glueck umzuschreiben.

DO $$
DECLARE
  r            RECORD;
  v_qual       TEXT;
  v_check      TEXT;
  v_sql        TEXT;
  v_rollen     TEXT;
  v_umgestellt INT := 0;
  ALT  CONSTANT TEXT := 'client_id = get_my_client_id()';
  NEU  CONSTANT TEXT := 'client_id IN (SELECT get_my_client_ids())';
BEGIN
  FOR r IN
    SELECT tablename, policyname, cmd, qual, with_check, roles
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (COALESCE(qual, '') || COALESCE(with_check, '')) LIKE '%get_my_client_id()%'
    ORDER BY tablename, policyname
  LOOP
    v_qual  := r.qual;
    v_check := r.with_check;

    IF (COALESCE(v_qual, '') || COALESCE(v_check, '')) LIKE '%get_my_client_id()%'
       AND (COALESCE(v_qual, '') || COALESCE(v_check, '')) NOT LIKE '%' || ALT || '%' THEN
      RAISE WARNING 'Policy "%" auf % nutzt get_my_client_id() in unerwarteter Form und bleibt unverändert: % / %',
        r.policyname, r.tablename, v_qual, v_check;
      CONTINUE;
    END IF;

    v_qual  := replace(COALESCE(v_qual,  ''), ALT, NEU);
    v_check := replace(COALESCE(v_check, ''), ALT, NEU);

    v_rollen := array_to_string(r.roles, ', ');

    v_sql := format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);
    EXECUTE v_sql;

    v_sql := format('CREATE POLICY %I ON public.%I FOR %s TO %s',
                    r.policyname, r.tablename, r.cmd, v_rollen);
    IF r.qual IS NOT NULL THEN
      v_sql := v_sql || format(' USING (%s)', v_qual);
    END IF;
    IF r.with_check IS NOT NULL THEN
      v_sql := v_sql || format(' WITH CHECK (%s)', v_check);
    END IF;

    EXECUTE v_sql;
    v_umgestellt := v_umgestellt + 1;
    RAISE NOTICE 'Umgestellt: %.%', r.tablename, r.policyname;
  END LOOP;

  RAISE NOTICE '% Policy(s) auf get_my_client_ids() umgestellt.', v_umgestellt;
END $$;


-- ============================================================
-- TEIL B – monat_abschliessen()
-- ============================================================
-- Die Berechtigungspruefung in der Funktion haengt an derselben
-- Zufallsauswahl. monat_oeffnen() wurde in Migration 026 bereits auf
-- die Kanzlei eingeschraenkt und braucht die Aenderung nicht.

CREATE OR REPLACE FUNCTION monat_abschliessen(p_client_id UUID, p_year INT, p_month INT)
RETURNS month_closures
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row month_closures;
  v_period_start DATE := make_date(p_year, p_month, 1);
  v_period_end   DATE := (make_date(p_year, p_month, 1) + INTERVAL '1 month' - INTERVAL '1 day')::date;
BEGIN
  IF NOT (
    p_client_id IN (SELECT get_my_client_ids())
    OR (get_my_role() IN ('admin','kanzlei') AND p_client_id IN (SELECT id FROM clients WHERE tenant_id = get_my_tenant_id()))
    OR is_superadmin()
  ) THEN
    RAISE EXCEPTION 'Keine Berechtigung für diesen Mandanten.';
  END IF;

  INSERT INTO month_closures (client_id, period_year, period_month, closed_by)
  VALUES (p_client_id, p_year, p_month, auth.uid())
  ON CONFLICT (client_id, period_year, period_month)
  DO UPDATE SET closed_at   = NOW(),
                closed_by   = auth.uid(),
                reopened_at = NULL,
                reopened_by = NULL
  RETURNING * INTO v_row;

  UPDATE transactions
     SET is_locked = true
   WHERE client_id = p_client_id
     AND booking_date BETWEEN v_period_start AND v_period_end;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION monat_abschliessen(UUID, INT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION monat_abschliessen(UUID, INT, INT) TO authenticated;


-- ============================================================
-- TEIL C – get_my_client_id() wenigstens stabil machen
-- ============================================================
-- Nach Teil A verwendet keine Policy die Funktion mehr. Falls sie
-- irgendwo im Altbestand noch auftaucht, soll sie zumindest immer
-- denselben Mandanten liefern statt eines beliebigen: den zuerst
-- zugeordneten.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_my_client_id'
  ) THEN
    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION get_my_client_id()
      RETURNS UUID
      LANGUAGE sql
      STABLE
      SECURITY DEFINER
      SET search_path = public, pg_temp
      AS $body$
        SELECT client_id
        FROM client_memberships
        WHERE user_id = auth.uid()
        ORDER BY created_at, client_id
        LIMIT 1
      $body$;
    $fn$;
    EXECUTE $c$
      COMMENT ON FUNCTION get_my_client_id() IS
        'Erster zugeordneter Mandant. Nur noch für Altcode – für Berechtigungen bitte get_my_client_ids() verwenden, sonst sehen Benutzer mit mehreren Mandanten nur einen davon.'
    $c$;
  END IF;
END $$;


-- ============================================================
-- KONTROLLE
-- ============================================================
--   -- Darf nichts mehr liefern:
--   SELECT policyname, tablename FROM pg_policies
--   WHERE schemaname = 'public'
--     AND (COALESCE(qual,'') || COALESCE(with_check,'')) LIKE '%get_my_client_id()%';
--
--   -- Gegenprobe: sollte für jede betroffene Tabelle eine Zeile zeigen
--   SELECT tablename, policyname FROM pg_policies
--   WHERE schemaname = 'public'
--     AND (COALESCE(qual,'') || COALESCE(with_check,'')) LIKE '%get_my_client_ids%'
--   ORDER BY 1, 2;
--
--   -- Benutzer mit mehreren Mandanten:
--   SELECT u.email, COUNT(*) FROM client_memberships m
--   JOIN users u ON u.id = m.user_id
--   GROUP BY 1 HAVING COUNT(*) > 1;
--
-- Danach in der App testen: Buchungen anlegen und ändern, Rechnung
-- erstellen, Beleg hochladen, Kunde anlegen – alles als Klient.
-- ============================================================
