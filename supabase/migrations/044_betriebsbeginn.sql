-- ============================================================
-- KPS Smart Buchhaltung – Migration 044
-- Betriebsbeginn je Mandant
--
-- Anforderung vom 26.08.2026 (Rumpfjahr Sep–Dez): Wer unterjährig
-- startet, soll Monate VOR dem Betriebsbeginn nicht künstlich als
-- "Nullmonate" abschließen müssen. Ein Betriebsbeginn-Datum am
-- Mandanten nimmt diese Monate überall aus dem Spiel:
--   * uva_uebermitteln() verlangt den Monatsabschluss nur noch für
--     Monate, die (ganz oder teilweise) nach dem Betriebsbeginn liegen
--   * Monatsabschluss-Seite und Dashboard blenden frühere Monate aus
--     (App-Seite, gleiche Auslieferung)
-- NULL = keine Einschränkung, Verhalten wie bisher.
--
-- Idempotent. Ausfuehren in: Supabase -> SQL Editor -> Run
-- ============================================================

ALTER TABLE clients ADD COLUMN IF NOT EXISTS betriebsbeginn DATE;

COMMENT ON COLUMN clients.betriebsbeginn IS
  'Offizieller Beginn der betrieblichen Tätigkeit (z. B. 2026-09-01 bei Rumpfjahr Sep–Dez). Monate, die vollständig davor liegen, verlangen keinen Monatsabschluss und erscheinen nicht in Monatsabschluss/Dashboard-Aufgaben. NULL = keine Einschränkung.';


-- uva_uebermitteln: Originalkörper aus Migration 043, ergänzt um den
-- Betriebsbeginn beim Monatsabschluss-Check.
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
  v_beginn        DATE;
  v_start_month   INT;
  v_period_start  DATE;
  v_period_end    DATE;
  v_monat         INT;
  v_monatsende    DATE;
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

  SELECT tenant_id, vat_period, betriebsbeginn
    INTO v_client_tenant, v_vat_period, v_beginn
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

  -- Migration 043/044: Alle Monate des Zeitraums müssen abgeschlossen
  -- sein – ausgenommen Monate, die vollständig VOR dem Betriebsbeginn
  -- liegen (Migration 044): dort gab es den Betrieb noch nicht.
  FOR v_monat IN v_start_month..v_tr.period_month LOOP
    v_monatsende := (make_date(v_tr.period_year, v_monat, 1) + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
    IF v_beginn IS NOT NULL AND v_monatsende < v_beginn THEN
      CONTINUE;
    END IF;
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
  'Markiert eine UVA-Meldung als übermittelt und sperrt die Buchungen des Zeitraums. Voraussetzung (043/044): alle Monate des Zeitraums sind abgeschlossen – Monate vollständig vor clients.betriebsbeginn ausgenommen.';


-- ============================================================
-- KONTROLLE
-- ============================================================
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'clients' AND column_name = 'betriebsbeginn';
-- ============================================================
