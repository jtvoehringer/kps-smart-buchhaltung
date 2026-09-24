-- ============================================================
-- KPS Smart Buchhaltung – Migration 026
-- UVA-Summen in der Datenbank, Sperrlogik geschlossen
--
-- Behebt:
--   F-12  Die UVA lud ALLE Buchungen aller Jahre in den Browser und
--         summierte dort. PostgREST liefert aber hoechstens
--         db.max_rows Zeilen (Supabase-Default 1000) – ohne Fehler
--         und ohne Hinweis. Die Abfrage sortiert aufsteigend nach
--         booking_date, abgeschnitten werden also ausgerechnet die
--         NEUESTEN Buchungen, d.h. die des zu meldenden Zeitraums.
--         Ab etwa 1000 Buchungen meldet der Mandant damit eine zu
--         niedrige Zahllast, ohne dass irgendwo etwas auffaellt.
--
--   F-11  monat_oeffnen() entsperrte pauschal alle Buchungen eines
--         Monats, auch wenn fuer den Zeitraum bereits eine UVA
--         uebermittelt war.
--
--   D-4   Der Monatssperr-Trigger deckte kein DELETE ab und pruefte
--         beim UPDATE nur das NEUE Buchungsdatum. Eine Buchung liess
--         sich also aus einem gesperrten Monat herausschieben oder
--         ganz loeschen.
--
-- Idempotent. Ausfuehren in: Supabase -> SQL Editor -> Run
-- ============================================================


-- ============================================================
-- TEIL A – UVA-Summen serverseitig
-- ============================================================
-- Aggregiert im Postgres statt im Browser. Damit gibt es keine
-- Zeilenobergrenze mehr und die Datenmenge ist unabhaengig vom
-- Buchungsbestand konstant klein (hoechstens 8 Zeilen).
--
-- Privatumsaetze bleiben aussen vor (F-5), ebenso wie in den
-- uebrigen Auswertungen.

CREATE OR REPLACE FUNCTION uva_summe(
  p_client_id UUID,
  p_von       DATE,
  p_bis       DATE
)
RETURNS TABLE (
  typ                  TEXT,
  vat_rate             INT,
  bemessungsgrundlage  NUMERIC,
  steuer               NUMERIC,
  anzahl               BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM client_memberships
    WHERE client_id = p_client_id AND user_id = auth.uid()
  ) AND NOT is_superadmin() AND get_my_role() NOT IN ('kanzlei', 'admin') THEN
    RAISE EXCEPTION 'Keine Berechtigung für diesen Mandanten.';
  END IF;

  RETURN QUERY
  SELECT t.type::TEXT,
         t.vat_rate::INT,
         ROUND(SUM(t.amount_net), 2),
         ROUND(SUM(t.vat_amount), 2),
         COUNT(*)
  FROM transactions t
  WHERE t.client_id = p_client_id
    AND t.booking_date >= p_von
    AND t.booking_date <= p_bis
    AND t.is_private = false
  GROUP BY t.type, t.vat_rate
  ORDER BY t.type, t.vat_rate;
END;
$$;

REVOKE ALL ON FUNCTION uva_summe(UUID, DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION uva_summe(UUID, DATE, DATE) TO authenticated;

COMMENT ON FUNCTION uva_summe(UUID, DATE, DATE) IS
  'Summiert Bemessungsgrundlage und Steuer je Buchungsart und Steuersatz für einen Zeitraum. Ersetzt die Aggregation im Browser, die ab dem PostgREST-Zeilenlimit still falsche Werte lieferte.';


-- ============================================================
-- TEIL B – Jahre mit Buchungen
-- ============================================================
-- Bisher wurden dafuer ALLE Buchungsdaten geladen, nur um daraus die
-- Jahresliste eines Auswahlfeldes zu bilden.

CREATE OR REPLACE FUNCTION buchungsjahre(p_client_id UUID)
RETURNS TABLE (jahr INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM client_memberships
    WHERE client_id = p_client_id AND user_id = auth.uid()
  ) AND NOT is_superadmin() AND get_my_role() NOT IN ('kanzlei', 'admin') THEN
    RAISE EXCEPTION 'Keine Berechtigung für diesen Mandanten.';
  END IF;

  RETURN QUERY
  SELECT DISTINCT EXTRACT(YEAR FROM t.booking_date)::INT
  FROM transactions t
  WHERE t.client_id = p_client_id
  ORDER BY 1 DESC;
END;
$$;

REVOKE ALL ON FUNCTION buchungsjahre(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION buchungsjahre(UUID) TO authenticated;


-- ============================================================
-- TEIL C – Monatssummen fürs Dashboard
-- ============================================================
-- Gleiches Muster: das Dashboard lud alle Buchungen aller Jahre.

-- Liefert alle Jahre auf einmal. Das sind hoechstens zwoelf Zeilen je
-- Jahr mit Buchungen, also auch nach Jahren noch eine winzige Menge –
-- und der Jahres-Umschalter im Dashboard braucht keinen Nachladeweg.
DROP FUNCTION IF EXISTS monatssummen(UUID, INT);

CREATE OR REPLACE FUNCTION monatssummen(p_client_id UUID)
RETURNS TABLE (
  jahr         INT,
  monat        INT,
  einnahmen    NUMERIC,
  ausgaben     NUMERIC,
  ust          NUMERIC,
  vst          NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM client_memberships
    WHERE client_id = p_client_id AND user_id = auth.uid()
  ) AND NOT is_superadmin() AND get_my_role() NOT IN ('kanzlei', 'admin') THEN
    RAISE EXCEPTION 'Keine Berechtigung für diesen Mandanten.';
  END IF;

  RETURN QUERY
  SELECT EXTRACT(YEAR  FROM t.booking_date)::INT,
         EXTRACT(MONTH FROM t.booking_date)::INT,
         COALESCE(ROUND(SUM(t.amount_gross) FILTER (WHERE t.type = 'income'),  2), 0),
         COALESCE(ROUND(SUM(t.amount_gross) FILTER (WHERE t.type = 'expense'), 2), 0),
         COALESCE(ROUND(SUM(t.vat_amount)   FILTER (WHERE t.type = 'income'),  2), 0),
         COALESCE(ROUND(SUM(t.vat_amount)   FILTER (WHERE t.type = 'expense'), 2), 0)
  FROM transactions t
  WHERE t.client_id = p_client_id
    AND t.is_private = false
  GROUP BY 1, 2
  ORDER BY 1, 2;
END;
$$;

REVOKE ALL ON FUNCTION monatssummen(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION monatssummen(UUID) TO authenticated;


-- ============================================================
-- TEIL D – Monatssperre: DELETE und Herausschieben abdecken
-- ============================================================

CREATE OR REPLACE FUNCTION check_month_not_closed()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_zeile RECORD;
BEGIN
  -- Beim UPDATE beide Seiten prüfen: eine Buchung darf weder in einen
  -- gesperrten Monat hinein noch aus einem heraus verschoben werden.
  IF TG_OP = 'DELETE' THEN
    v_zeile := OLD;
  ELSE
    v_zeile := NEW;
    IF TG_OP = 'UPDATE' AND OLD.booking_date IS DISTINCT FROM NEW.booking_date THEN
      IF EXISTS (
        SELECT 1 FROM month_closures
        WHERE client_id    = OLD.client_id
          AND period_year  = EXTRACT(YEAR  FROM OLD.booking_date)::INT
          AND period_month = EXTRACT(MONTH FROM OLD.booking_date)::INT
          AND reopened_at IS NULL
      ) THEN
        RAISE EXCEPTION 'Die Buchung liegt im abgeschlossenen Monat %/% und kann nicht verschoben werden.',
          EXTRACT(MONTH FROM OLD.booking_date), EXTRACT(YEAR FROM OLD.booking_date);
      END IF;
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM month_closures
    WHERE client_id    = v_zeile.client_id
      AND period_year  = EXTRACT(YEAR  FROM v_zeile.booking_date)::INT
      AND period_month = EXTRACT(MONTH FROM v_zeile.booking_date)::INT
      AND reopened_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Monat %/% ist abgeschlossen und gesperrt.',
      EXTRACT(MONTH FROM v_zeile.booking_date), EXTRACT(YEAR FROM v_zeile.booking_date);
  END IF;

  RETURN v_zeile;
END;
$$;

DROP TRIGGER IF EXISTS trg_transactions_check_month_closed ON transactions;
CREATE TRIGGER trg_transactions_check_month_closed
  BEFORE INSERT OR DELETE OR UPDATE OF
    booking_date, amount_net, vat_rate, vat_amount, category_id, description, type
  ON transactions
  FOR EACH ROW EXECUTE FUNCTION check_month_not_closed();


-- ============================================================
-- TEIL E – Wiedereröffnen darf eine übermittelte UVA nicht entsperren
-- ============================================================
-- Signatur und Rückgabetyp bleiben wie in Migration 016, ebenso die
-- Beschränkung auf die Kanzlei. Neu ist ausschließlich die Prüfung
-- gegen bereits übermittelte Voranmeldungen.

CREATE OR REPLACE FUNCTION monat_oeffnen(p_client_id UUID, p_year INT, p_month INT)
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
    (get_my_role() IN ('admin','kanzlei') AND p_client_id IN (SELECT id FROM clients WHERE tenant_id = get_my_tenant_id()))
    OR is_superadmin()
  ) THEN
    RAISE EXCEPTION 'Nur die Kanzlei kann einen abgeschlossenen Monat wieder öffnen.';
  END IF;

  -- Neu: liegt der Monat in einer bereits übermittelten UVA, bleibt er
  -- gesperrt. Sonst entkoppelt eine spätere Änderung die abgegebene
  -- Meldung still von den Grunddaten. Berücksichtigt Monats- und
  -- Quartalsmeldung (bei quartalsweise deckt period_month die drei
  -- Monate period_month-2 bis period_month ab).
  IF EXISTS (
    SELECT 1
    FROM tax_returns tr
    JOIN clients c ON c.id = tr.client_id
    WHERE tr.client_id  = p_client_id
      AND tr.status     = 'submitted'
      AND tr.period_year = p_year
      AND p_month BETWEEN
            CASE WHEN c.vat_period = 'quarterly'
                 THEN GREATEST(tr.period_month - 2, 1)
                 ELSE tr.period_month END
            AND tr.period_month
  ) THEN
    RAISE EXCEPTION 'Für diesen Zeitraum wurde bereits eine UVA übermittelt. Der Monat kann nicht geöffnet werden – bitte stattdessen eine Berichtigung erfassen.';
  END IF;

  UPDATE month_closures
  SET reopened_at = NOW(), reopened_by = auth.uid()
  WHERE client_id = p_client_id AND period_year = p_year AND period_month = p_month
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Dieser Monat ist nicht abgeschlossen.';
  END IF;

  UPDATE transactions
  SET is_locked = false
  WHERE client_id = p_client_id
    AND booking_date BETWEEN v_period_start AND v_period_end;

  RETURN v_row;
END;
$$;


-- ============================================================
-- KONTROLLE
-- ============================================================
--
--   SELECT * FROM uva_summe('<client-id>', '2026-01-01', '2026-03-31');
--   SELECT * FROM buchungsjahre('<client-id>');
--   SELECT * FROM monatssummen('<client-id>', 2026);
--
-- ============================================================
