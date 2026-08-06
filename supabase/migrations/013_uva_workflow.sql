-- ============================================================
-- 013: UVA-Workflow – "Als übermittelt markieren" + Kanzlei-Rechte
-- ============================================================
-- Hintergrund: transactions.is_locked war von Anfang an dafür vorgesehen,
-- beim Übermitteln einer UVA gesetzt zu werden (siehe Kommentar in
-- 001_initial_schema.sql), aber bisher konnte laut RLS NIEMAND außer
-- Superadmin transactions.is_locked setzen oder tax_returns.status auf
-- 'submitted' ändern. Diese Migration schließt die Lücke:
--
--  1. Kanzlei/Admin dürfen (wie bisher nur der Klient selbst) UVA-Entwürfe
--     für ihre Klienten berechnen und speichern (status = 'draft').
--  2. Eine SECURITY DEFINER Funktion uva_uebermitteln() sperrt atomar alle
--     Buchungen des Zeitraums UND markiert die UVA-Meldung als übermittelt.
--     Berechtigt sind: der Klient selbst, Kanzlei/Admin des zugehörigen
--     Tenants, oder Superadmin.
-- ============================================================

-- 1) Kanzlei/Admin dürfen UVA-Entwürfe verwalten
CREATE POLICY "Kanzlei kann UVA-Entwuerfe verwalten" ON tax_returns
  FOR ALL USING (
    get_my_role() IN ('admin','kanzlei')
    AND status = 'draft'
    AND client_id IN (SELECT id FROM clients WHERE tenant_id = get_my_tenant_id())
  );

-- 2) Übermitteln + Sperren in einer atomaren, berechtigungsgeprüften Funktion
CREATE OR REPLACE FUNCTION uva_uebermitteln(p_tax_return_id UUID)
RETURNS tax_returns
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tr            tax_returns;
  v_client_tenant UUID;
  v_vat_period    TEXT;
  v_start_month   INT;
  v_period_start  DATE;
  v_period_end    DATE;
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
$$;

GRANT EXECUTE ON FUNCTION uva_uebermitteln(UUID) TO authenticated;
