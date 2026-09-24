-- ============================================================
-- KPS Smart Buchhaltung – Migration 029
-- Umsatzsteuer-Kennzeichen je Buchung
--
-- Behebt F-13:
--   Die UVA kannte nur den Steuersatz. Jeder Umsatz mit 0 % landete
--   pauschal unter "Steuerfreie Umsätze mit Vorsteuerabzug (Kz 011)" –
--   der Kennzahl für Ausfuhrlieferungen. Kleinunternehmerumsaetze
--   (Kz 016), innergemeinschaftliche Lieferungen (Kz 017),
--   Reverse-Charge-Leistungen (Kz 021) und unecht befreite Umsaetze
--   (Kz 020) wurden damit alle falsch gemeldet.
--
--   Innergemeinschaftliche Erwerbe fehlten vollstaendig: weder die
--   Erwerbsteuer (Kz 070/072) noch der korrespondierende
--   Vorsteuerabzug (Kz 065) wurden erfasst.
--
-- Der Steuersatz sagt, WIE VIEL Steuer anfaellt. Das Kennzeichen
-- sagt, WAS fuer ein Umsatz es ist. Erst beides zusammen ergibt die
-- amtliche Kennzahl.
--
-- Idempotent. Ausfuehren in: Supabase -> SQL Editor -> Run
-- ============================================================


-- ============================================================
-- TEIL A – Spalte
-- ============================================================

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS ust_kennzeichen TEXT NOT NULL DEFAULT 'normal';

DO $$
BEGIN
  ALTER TABLE transactions ADD CONSTRAINT transactions_ust_kennzeichen_check
    CHECK (ust_kennzeichen IN (
      'normal',
      'ausfuhr',
      'ig_lieferung',
      'reverse_charge_ausgang',
      'kleinunternehmer',
      'unecht_befreit',
      'ig_erwerb',
      'reverse_charge_eingang'
    ));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON COLUMN transactions.ust_kennzeichen IS
  'Art des Umsatzes für die UVA. Bestimmt zusammen mit vat_rate die amtliche Kennzahl im Formular U30. Standard "normal" = steuerpflichtiger Inlandsumsatz.';


-- Kleinunternehmer: bestehende 0-%-Einnahmen sinnvoll vorbelegen,
-- damit sie nicht faelschlich als Ausfuhrlieferung gemeldet werden.
UPDATE transactions t
   SET ust_kennzeichen = 'kleinunternehmer'
  FROM clients c
 WHERE c.id = t.client_id
   AND t.type = 'income'
   AND t.vat_rate = 0
   AND t.ust_kennzeichen = 'normal'
   AND c.ust_status = 'kleinunternehmer'
   AND NOT c.regelbesteuerung_optiert;


-- ============================================================
-- TEIL B – Index für die Auswertung
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_transactions_uva
  ON transactions (client_id, booking_date, type, ust_kennzeichen, vat_rate)
  WHERE is_private = false;


-- ============================================================
-- TEIL C – uva_summe() um das Kennzeichen erweitern
-- ============================================================
-- Rueckgabetyp aendert sich, daher erst loeschen.

DROP FUNCTION IF EXISTS uva_summe(UUID, DATE, DATE);

CREATE OR REPLACE FUNCTION uva_summe(
  p_client_id UUID,
  p_von       DATE,
  p_bis       DATE
)
RETURNS TABLE (
  typ                  TEXT,
  ust_kennzeichen      TEXT,
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
         t.ust_kennzeichen::TEXT,
         t.vat_rate::INT,
         ROUND(SUM(t.amount_net), 2),
         ROUND(SUM(t.vat_amount), 2),
         COUNT(*)
  FROM transactions t
  WHERE t.client_id = p_client_id
    AND t.booking_date >= p_von
    AND t.booking_date <= p_bis
    AND t.is_private = false
  GROUP BY t.type, t.ust_kennzeichen, t.vat_rate
  ORDER BY t.type, t.ust_kennzeichen, t.vat_rate;
END;
$$;

REVOKE ALL ON FUNCTION uva_summe(UUID, DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION uva_summe(UUID, DATE, DATE) TO authenticated;

COMMENT ON FUNCTION uva_summe(UUID, DATE, DATE) IS
  'Summiert Bemessungsgrundlage und Steuer je Buchungsart, Umsatzsteuer-Kennzeichen und Steuersatz für einen Zeitraum.';


-- ============================================================
-- KONTROLLE
-- ============================================================
--   SELECT * FROM uva_summe('<client-id>', '2026-01-01', '2026-03-31');
--
--   SELECT ust_kennzeichen, type, count(*), sum(amount_net)
--   FROM transactions GROUP BY 1, 2 ORDER BY 1, 2;
-- ============================================================
