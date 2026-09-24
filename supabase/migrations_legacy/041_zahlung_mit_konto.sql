-- ============================================================
-- KPS Smart Buchhaltung – Migration 041
-- Zahlungen einem Konto zuordnen + Buchungsfunktion repariert
--
-- Behebt F-28 (kritisch):
--   rechnung_bezahlt_buchen() liest den Kundennamen noch über
--   COALESCE(c.company_name, c.name) – Migration 023 hat
--   customers.company_name aber entfernt. Seitdem scheitert
--   "Als bezahlt buchen" zur Laufzeit mit
--   "column c.company_name does not exist".
--
-- Neu (Anforderung vom 12.08.2026):
--   Beim Verbuchen einer Zahlung wird erfasst, MIT WELCHEM Konto
--   bezahlt wurde (Girokonto, Kreditkarte, Kreditkonto). Beispiel:
--   Eingangsrechnung per Kreditkarte -> Buchung gehoert aufs
--   Kreditkartenkonto. Erst damit lassen sich die Salden in der
--   Kontoabstimmung (Migration 034) gegen die Auszuege halten.
--   transactions.account_id existiert seit Migration 016 – der Weg
--   ueber die Offenen Posten hat ihn nur nie gesetzt.
--
-- Idempotent. Ausfuehren in: Supabase -> SQL Editor -> Run
-- ============================================================

-- Signatur aendert sich: alte Fassungen entfernen.
DROP FUNCTION IF EXISTS rechnung_bezahlt_buchen(UUID, UUID, DATE);
DROP FUNCTION IF EXISTS rechnung_bezahlt_buchen(UUID, UUID, DATE, UUID);

CREATE OR REPLACE FUNCTION rechnung_bezahlt_buchen(
  p_invoice_id  UUID,
  p_category_id UUID,
  p_paid_date   DATE,
  p_account_id  UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_inv        invoices%ROWTYPE;
  v_kundenname TEXT;
  v_first_tx   UUID := NULL;
  v_tx         UUID;
  r            RECORD;
BEGIN
  SELECT * INTO v_inv FROM invoices WHERE id = p_invoice_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rechnung nicht gefunden.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM client_memberships
    WHERE client_id = v_inv.client_id AND user_id = auth.uid()
  ) AND NOT is_superadmin() THEN
    RAISE EXCEPTION 'Keine Berechtigung für diesen Mandanten.';
  END IF;

  IF v_inv.status = 'cancelled' THEN
    RAISE EXCEPTION 'Eine stornierte Rechnung kann nicht als bezahlt gebucht werden.';
  END IF;
  IF v_inv.status = 'draft' THEN
    RAISE EXCEPTION 'Ein Entwurf kann nicht als bezahlt gebucht werden. Bitte zuerst finalisieren.';
  END IF;
  -- Kern der Doppelbuchungssperre
  IF v_inv.transaction_id IS NOT NULL THEN
    RAISE EXCEPTION 'Diese Rechnung wurde bereits verbucht (Buchung %).', v_inv.transaction_id;
  END IF;

  IF p_category_id IS NULL THEN
    RAISE EXCEPTION 'Bitte eine Einnahmen-Kategorie angeben.';
  END IF;

  -- Das Konto muss – wenn angegeben – demselben Mandanten gehören.
  IF p_account_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM accounts
    WHERE id = p_account_id AND client_id = v_inv.client_id
  ) THEN
    RAISE EXCEPTION 'Das gewählte Konto gehört nicht zu diesem Mandanten.';
  END IF;

  -- F-28: seit Migration 023 heißt die Bezeichnung schlicht "name" –
  -- company_name existiert nicht mehr.
  SELECT c.name INTO v_kundenname
  FROM customers c WHERE c.id = v_inv.customer_id;

  -- Pro Steuersatz eine Buchung
  FOR r IN
    SELECT (it->>'vat_rate')::INT                       AS vat_rate,
           ROUND(SUM((it->>'amount_net')::NUMERIC), 2)  AS netto,
           ROUND(SUM((it->>'amount_vat')::NUMERIC), 2)  AS ust
    FROM jsonb_array_elements(v_inv.items) AS it
    GROUP BY (it->>'vat_rate')::INT
    HAVING ROUND(SUM((it->>'amount_net')::NUMERIC), 2) <> 0
        OR ROUND(SUM((it->>'amount_vat')::NUMERIC), 2) <> 0
    ORDER BY 1
  LOOP
    INSERT INTO transactions (
      client_id, category_id, type, amount_net, vat_rate, vat_amount,
      booking_date, description, import_source, account_id
    ) VALUES (
      v_inv.client_id, p_category_id, 'income', r.netto, r.vat_rate, r.ust,
      p_paid_date,
      'Zahlungseingang ' || COALESCE(v_inv.invoice_number, '(ohne Nummer)')
        || COALESCE(' – ' || v_kundenname, ''),
      'manual',
      p_account_id
    )
    RETURNING id INTO v_tx;

    IF v_first_tx IS NULL THEN
      v_first_tx := v_tx;
    END IF;
  END LOOP;

  IF v_first_tx IS NULL THEN
    RAISE EXCEPTION 'Die Rechnung enthält keine verbuchbaren Positionen.';
  END IF;

  UPDATE invoices
     SET status         = 'paid',
         paid_date      = p_paid_date,
         transaction_id = v_first_tx
   WHERE id = p_invoice_id;

  RETURN v_first_tx;
END;
$$;

REVOKE ALL ON FUNCTION rechnung_bezahlt_buchen(UUID, UUID, DATE, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION rechnung_bezahlt_buchen(UUID, UUID, DATE, UUID) TO authenticated;

COMMENT ON FUNCTION rechnung_bezahlt_buchen(UUID, UUID, DATE, UUID) IS
  'Bucht den Zahlungseingang einer offenen Ausgangsrechnung: je Steuersatz eine Einnahmenbuchung zum Zahldatum, optional einem Konto zugeordnet. Setzt die Rechnung auf bezahlt. Doppelbuchung ist gesperrt.';


-- ============================================================
-- KONTROLLE
-- ============================================================
--   SELECT proname, pg_get_function_identity_arguments(oid)
--   FROM pg_proc WHERE proname = 'rechnung_bezahlt_buchen';
--   -- erwartet: p_invoice_id uuid, p_category_id uuid, p_paid_date date,
--   --           p_account_id uuid DEFAULT NULL
-- ============================================================
