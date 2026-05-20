-- ============================================================
-- KPS Smart Buchhaltung – Migration 002
-- Cron-Job: Daueraufträge täglich ausführen
-- Benötigt: Supabase → Integrations → pg_cron aktivieren
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Funktion: fällige Daueraufträge → neue Buchungen erzeugen
CREATE OR REPLACE FUNCTION process_recurring_transactions()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  rec RECORD;
  new_vat NUMERIC(12,2);
BEGIN
  FOR rec IN
    SELECT * FROM recurring_transactions
    WHERE is_active = TRUE
      AND next_run_date <= CURRENT_DATE
  LOOP
    -- USt berechnen
    new_vat := ROUND(rec.amount_net * rec.vat_rate / 100.0, 2);

    -- Buchung anlegen
    INSERT INTO transactions (
      client_id, category_id, recurring_id,
      type, amount_net, vat_rate, vat_amount,
      booking_date, description
    ) VALUES (
      rec.client_id, rec.category_id, rec.id,
      rec.type, rec.amount_net, rec.vat_rate, new_vat,
      rec.next_run_date,
      'Dauerauftrag: ' || rec.name
    );

    -- next_run_date vorsetzen
    UPDATE recurring_transactions
    SET next_run_date = CASE rec.interval
      WHEN 'monthly'     THEN (rec.next_run_date + INTERVAL '1 month')::DATE
      WHEN 'quarterly'   THEN (rec.next_run_date + INTERVAL '3 months')::DATE
      WHEN 'semi-annual' THEN (rec.next_run_date + INTERVAL '6 months')::DATE
      WHEN 'annual'      THEN (rec.next_run_date + INTERVAL '1 year')::DATE
    END
    WHERE id = rec.id;

  END LOOP;
END;
$$;

-- Täglich um 06:00 UTC ausführen
SELECT cron.schedule(
  'process-recurring-transactions',
  '0 6 * * *',
  'SELECT process_recurring_transactions()'
);
