-- ============================================================
-- KPS Smart Buchhaltung – Migration 043
-- UVA erst nach Monatsabschluss
--
-- Anforderung vom 12.08.2026: Bevor die UVA übermittelt werden kann,
-- müssen die Monate des Meldezeitraums abgeschlossen sein
-- (month_closures, Migration 016). Sonst könnte sich die gemeldete
-- Zahllast nach der Übermittlung noch ändern.
--
-- Die Funktion ist der Originalkörper von uva_uebermitteln, ergänzt
-- NUR um die Abschluss-Prüfung (zwischen Berechtigungs-Check und
-- Buchungssperre). Ein wiedereröffneter Monat (reopened_at gesetzt)
-- gilt als NICHT abgeschlossen.
--
-- Idempotent. Ausfuehren in: Supabase -> SQL Editor -> Run
-- ============================================================

CREATE OR REPLACE FUNCTION public.uva_uebermitteln(p_tax_return_id uuid)
 RETURNS tax_returns
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tr            tax_returns;
  v_client_tenant UUID;
  v_vat_period    TEXT;
  v_start_month   INT;
  v_period_start  DATE;
  v_period_end    DATE;
  v_monat         INT;
  v_fehlend       TEXT[] := '{}';
  v_monate        TEXT[] := ARRAY['Jänner','Februar','März','April','Mai','Juni',
                                  'Juli','August','September','Oktober','November','Dezember'];
BEGIN
  SELECT * INTO v_tr FROM tax_returns WHERE id = p_tax_return_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'UVA-Meldung nicht gefunden';
  END IF;
  IF v_tr.status = 'submitted' THEN
    RAISE EXCEPTION 'Diese UVA-Meldung wurde bereits übermittelt';
  END IF;

  SELECT tenant_id, vat_period INTO v_client_tenant, v_vat_period
    FROM clients WHERE id = v_tr.client_id;

  IF NOT (
    is_superadmin()
    OR (get_my_role() IN ('admin','kanzlei') AND v_client_tenant = get_my_tenant_id())
    OR (v_tr.client_id = get_my_client_id())
  ) THEN
    RAISE EXCEPTION 'Keine Berechtigung für diese UVA-Meldung';
  END IF;

  -- Zeitraum-Grenzen bestimmen. Konvention: bei quartalsweiser Meldung
  -- repräsentiert period_month den letzten Monat des Quartals (3/6/9/12)
  -- und deckt die 3 Monate davor mit ab; bei monatlicher Meldung ist
  -- period_month der tatsächliche Kalendermonat.
  IF v_vat_period = 'quarterly' THEN
    v_start_month := v_tr.period_month - 2;
  ELSE
    v_start_month := v_tr.period_month;
  END IF;

  -- NEU (Migration 043): Alle Monate des Zeitraums müssen abgeschlossen
  -- sein, bevor die Meldung übermittelt werden darf.
  FOR v_monat IN v_start_month..v_tr.period_month LOOP
    IF NOT EXISTS (
      SELECT 1 FROM month_closures
      WHERE client_id    = v_tr.client_id
        AND period_year  = v_tr.period_year
        AND period_month = v_monat
        AND reopened_at IS NULL
    ) THEN
      v_fehlend := v_fehlend || (v_monate[v_monat] || ' ' || v_tr.period_year);
    END IF;
  END LOOP;

  IF array_length(v_fehlend, 1) > 0 THEN
    RAISE EXCEPTION 'Vor der Übermittlung bitte im Monatsabschluss abschließen: %',
      array_to_string(v_fehlend, ', ');
  END IF;

  v_period_start := make_date(v_tr.period_year, v_start_month, 1);
  v_period_end   := (make_date(v_tr.period_year, v_tr.period_month, 1) + INTERVAL '1 month' - INTERVAL '1 day')::DATE;

  UPDATE transactions
    SET is_locked = TRUE
    WHERE client_id = v_tr.client_id
      AND booking_date >= v_period_start
      AND booking_date <= v_period_end;

  UPDATE tax_returns
    SET status = 'submitted', submitted_at = NOW()
    WHERE id = p_tax_return_id
    RETURNING * INTO v_tr;

  RETURN v_tr;
END;
$function$;

COMMENT ON FUNCTION public.uva_uebermitteln(uuid) IS
  'Markiert eine UVA-Meldung als übermittelt und sperrt die Buchungen des Zeitraums. Seit Migration 043 nur möglich, wenn alle Monate des Zeitraums im Monatsabschluss abgeschlossen sind.';


-- ============================================================
-- KONTROLLE
-- ============================================================
--   SELECT prosrc FROM pg_proc WHERE proname = 'uva_uebermitteln';
--   -- muss die month_closures-Prüfung enthalten
-- ============================================================
