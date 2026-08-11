-- ============================================================
-- KPS Smart Buchhaltung – Migration 021
-- Rechnungen: Ist-Besteuerung, atomare Nummernvergabe,
--             Buchung nur noch bei Zahlungseingang
--
-- Behebt:
--   F-1  Erloese wurden bis zu dreifach gebucht (Finalisieren +
--        "Als bezahlt buchen" + Bankimport wussten nichts voneinander)
--   F-2  Jedes erneute Speichern einer finalisierten Rechnung buchte
--        nochmals und verbrannte eine Rechnungsnummer; Entwuerfe mit
--        invoice_number = '' kollidierten am UNIQUE-Constraint
--   F-3  "Als bezahlt markieren" aenderte Buchungen per
--        .like('description', '%<nummer>%') – bei leerer Nummer wurde
--        daraus %% und traf den gesamten Buchungsbestand
--   F-6  Rechnungen mit gemischten Steuersaetzen wurden mit einem
--        einzigen Satz gebucht (UVA-Kennzahlen falsch)
--
-- Fachliche Entscheidung: IST-BESTEUERUNG (§ 17 UStG).
-- Das Finalisieren erzeugt nur den offenen Posten. Die Erloesbuchung
-- entsteht ausschliesslich beim Erfassen des Zahlungseingangs.
--
-- Idempotent. Ausfuehren in: Supabase -> SQL Editor -> Run
-- ============================================================


-- ============================================================
-- TEIL A – invoice_number: NULL statt Leerstring              (F-2)
-- ============================================================
--
-- Bisher: invoice_number TEXT NOT NULL + UNIQUE (client_id, invoice_number).
-- Entwuerfe wurden mit '' gespeichert -> der ZWEITE Entwurf desselben
-- Mandanten scheiterte am UNIQUE-Constraint. Und eine offene Rechnung
-- mit leerer Nummer machte F-3 zur Katastrophe.

ALTER TABLE invoices ALTER COLUMN invoice_number DROP NOT NULL;

UPDATE invoices SET invoice_number = NULL WHERE invoice_number = '';

ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_client_id_invoice_number_key;

-- Partieller Unique-Index: mehrere Entwuerfe ohne Nummer sind erlaubt,
-- vergebene Nummern bleiben pro Mandant eindeutig.
DROP INDEX IF EXISTS invoices_client_nr_uq;
CREATE UNIQUE INDEX invoices_client_nr_uq
  ON invoices (client_id, invoice_number)
  WHERE invoice_number IS NOT NULL;

-- Ab jetzt darf nur ein Entwurf ohne Nummer existieren.
-- NOT VALID: bestehende Altdaten werden nicht geprueft (in der
-- Produktivdatenbank gibt es eine bezahlte Rechnung ohne Nummer aus
-- der Testphase), neue und geaenderte Zeilen sehr wohl.
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_nr_required_when_open;
ALTER TABLE invoices ADD CONSTRAINT invoices_nr_required_when_open
  CHECK (status = 'draft' OR invoice_number IS NOT NULL) NOT VALID;

COMMENT ON COLUMN invoices.invoice_number IS
  'NULL solange Entwurf. Wird bei der Finalisierung atomar über naechste_rechnungsnummer() vergeben.';


-- ============================================================
-- TEIL B – Fehlende Indizes auf den Buchungsverknuepfungen
-- ============================================================
-- Werden ab sofort bei jedem Zahlungsvorgang und bei jedem
-- Loeschen einer Buchung (ON DELETE SET NULL) gelesen.

CREATE INDEX IF NOT EXISTS idx_invoices_transaction
  ON invoices(transaction_id) WHERE transaction_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_incoming_invoices_transaction
  ON incoming_invoices(transaction_id) WHERE transaction_id IS NOT NULL;


-- ============================================================
-- TEIL C – Atomare Rechnungsnummer                            (F-2)
-- ============================================================
--
-- Bisher: der Client las branding.invoice_next_nr aus einem beim
-- Seitenaufbau uebergebenen Prop, bildete daraus die Nummer und
-- schrieb alt+1 zurueck – ohne Fehlerpruefung. Zwei gleichzeitig
-- finalisierende Nutzer bekamen dieselbe Nummer; schlug das
-- Zaehler-Update still fehl, bekam JEDE weitere Rechnung dieselbe.
--
-- Jetzt: ein einziges UPDATE ... RETURNING unter Zeilensperre.

CREATE OR REPLACE FUNCTION naechste_rechnungsnummer(p_client_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_nr     INT;
  v_prefix TEXT;
  v_digits INT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM client_memberships
    WHERE client_id = p_client_id AND user_id = auth.uid()
  ) AND NOT is_superadmin() THEN
    RAISE EXCEPTION 'Keine Berechtigung für diesen Mandanten.';
  END IF;

  UPDATE client_branding
     SET invoice_next_nr = invoice_next_nr + 1
   WHERE client_id = p_client_id
  RETURNING invoice_next_nr - 1, invoice_prefix, invoice_nr_digits
       INTO v_nr, v_prefix, v_digits;

  IF v_nr IS NULL THEN
    RAISE EXCEPTION 'Für diesen Mandanten ist kein Rechnungs-Branding hinterlegt. Bitte zuerst unter Einstellungen anlegen.';
  END IF;

  RETURN COALESCE(v_prefix, 'RE-') || lpad(v_nr::text, COALESCE(v_digits, 3), '0');
END;
$$;

REVOKE ALL ON FUNCTION naechste_rechnungsnummer(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION naechste_rechnungsnummer(UUID) TO authenticated;

COMMENT ON FUNCTION naechste_rechnungsnummer(UUID) IS
  'Vergibt atomar die naechste Rechnungsnummer und erhoeht den Zaehler. Ersetzt das Read-Modify-Write im Client.';


-- ============================================================
-- TEIL D – Zahlungseingang verbuchen                     (F-1/3/6)
-- ============================================================
--
-- Eine einzige Transaktion fuer: Buchung(en) anlegen + Rechnung auf
-- 'paid' setzen + transaction_id verknuepfen. Damit gibt es keinen
-- Teilzustand mehr, in dem eine Buchung existiert, die Rechnung aber
-- weiter offen aussieht (und beim naechsten Klick nochmals bucht).
--
-- Zusaetzlich: pro Steuersatz eine eigene Buchungszeile. Eine Rechnung
-- mit 100,00 @ 20 % und 100,00 @ 10 % erzeugt jetzt zwei Buchungen und
-- landet damit korrekt in KZ 022 UND KZ 029 – statt wie bisher komplett
-- unter dem Satz der ersten Position.
--
-- Die Sperre gegen Doppelbuchung ist transaction_id IS NOT NULL.

CREATE OR REPLACE FUNCTION rechnung_bezahlt_buchen(
  p_invoice_id  UUID,
  p_category_id UUID,
  p_paid_date   DATE
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

  SELECT COALESCE(c.company_name, c.name) INTO v_kundenname
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
      booking_date, description, import_source
    ) VALUES (
      v_inv.client_id, p_category_id, 'income', r.netto, r.vat_rate, r.ust,
      p_paid_date,
      'Zahlungseingang ' || COALESCE(v_inv.invoice_number, '(ohne Nummer)')
        || COALESCE(' – ' || v_kundenname, ''),
      'manual'
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

REVOKE ALL ON FUNCTION rechnung_bezahlt_buchen(UUID, UUID, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION rechnung_bezahlt_buchen(UUID, UUID, DATE) TO authenticated;

COMMENT ON FUNCTION rechnung_bezahlt_buchen(UUID, UUID, DATE) IS
  'Bucht den Zahlungseingang einer Ausgangsrechnung atomar: je Steuersatz eine Buchung, Rechnung auf paid, transaction_id gesetzt. Verweigert die Doppelbuchung.';


-- ============================================================
-- TEIL E – Storno gibt die Rechnungsnummer nicht frei
-- ============================================================
-- Hinweis, kein Code: Eine stornierte Rechnung behaelt ihre Nummer.
-- Das ist gewollt – ein fortlaufender Nummernkreis darf keine Luecken
-- haben (§ 11 Abs. 1 Z 2 UStG), stornierte Nummern bleiben als Beleg
-- erhalten. Da unter Ist-Besteuerung eine offene Rechnung noch keine
-- Buchung hat, muss beim Stornieren auch keine Buchung rueckgaengig
-- gemacht werden.


-- ============================================================
-- KONTROLLE
-- ============================================================
--
-- Erwartet: invoice_number is_nullable = YES
--   SELECT column_name, is_nullable FROM information_schema.columns
--   WHERE table_name='invoices' AND column_name='invoice_number';
--
-- Erwartet: invoices_client_nr_uq als partieller Index
--   SELECT indexname, indexdef FROM pg_indexes
--   WHERE tablename='invoices' AND indexname='invoices_client_nr_uq';
--
-- Erwartet: beide Funktionen vorhanden, nur fuer authenticated
--   SELECT p.proname, has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth,
--          has_function_privilege('anon', p.oid, 'EXECUTE') AS anon
--   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--   WHERE n.nspname='public'
--     AND p.proname IN ('naechste_rechnungsnummer','rechnung_bezahlt_buchen');
--
-- ============================================================
