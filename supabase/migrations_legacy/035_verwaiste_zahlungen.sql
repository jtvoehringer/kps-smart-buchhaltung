-- ============================================================
-- KPS Smart Buchhaltung – Migration 035
-- Status nachziehen, wenn die zugehörige Buchung verschwindet
--
-- Behebt F-22:
--   invoices.transaction_id, incoming_invoices.transaction_id und
--   receipts.transaction_id haengen mit ON DELETE SET NULL an
--   transactions. Wird eine Buchung geloescht, verliert der Datensatz
--   also die Verknuepfung – behaelt aber seinen Status.
--
--   Damit steht eine Ausgangsrechnung weiter auf "bezahlt", obwohl
--   die Einnahme nicht mehr gebucht ist. Bei Ist-Besteuerung ist das
--   der Umsatz, der in der UVA fehlt: die Rechnung sieht erledigt
--   aus, in den Zahlen taucht sie nicht auf. Dasselbe auf der
--   Eingangsseite und bei Belegen, die als "gebucht" markiert
--   bleiben, ohne dass es die Buchung noch gibt.
--
--   Auffallen wuerde das erst beim Jahresabschluss – oder gar nicht.
--
--   Die Trigger setzen den Status zurueck, sobald die Verknuepfung
--   wegfaellt. Der Datensatz erscheint dann wieder in den offenen
--   Posten, wo er hingehoert.
--
-- Idempotent. Ausfuehren in: Supabase -> SQL Editor -> Run
-- ============================================================


-- ============================================================
-- TEIL A – Ausgangsrechnungen
-- ============================================================

CREATE OR REPLACE FUNCTION rechnung_zahlung_zuruecknehmen()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Nur der Fall "Buchung war da und ist jetzt weg".
  IF OLD.transaction_id IS NOT NULL AND NEW.transaction_id IS NULL
     AND NEW.status = 'paid' THEN
    NEW.status    := 'open';
    NEW.paid_date := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invoices_zahlung_zuruecknehmen ON invoices;
CREATE TRIGGER trg_invoices_zahlung_zuruecknehmen
  BEFORE UPDATE OF transaction_id ON invoices
  FOR EACH ROW EXECUTE FUNCTION rechnung_zahlung_zuruecknehmen();


-- ============================================================
-- TEIL B – Eingangsrechnungen
-- ============================================================

CREATE OR REPLACE FUNCTION eingangsrechnung_zahlung_zuruecknehmen()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.transaction_id IS NOT NULL AND NEW.transaction_id IS NULL
     AND NEW.status = 'paid' THEN
    NEW.status    := 'open';
    NEW.paid_date := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_incoming_invoices_zahlung_zuruecknehmen ON incoming_invoices;
CREATE TRIGGER trg_incoming_invoices_zahlung_zuruecknehmen
  BEFORE UPDATE OF transaction_id ON incoming_invoices
  FOR EACH ROW EXECUTE FUNCTION eingangsrechnung_zahlung_zuruecknehmen();


-- ============================================================
-- TEIL C – Belege
-- ============================================================
-- 'booked' heisst: aus diesem Beleg wurde eine Buchung. Faellt sie
-- weg, ist der Beleg wieder ein erkannter, aber unverbuchter Beleg.

CREATE OR REPLACE FUNCTION beleg_buchung_zuruecknehmen()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.transaction_id IS NOT NULL AND NEW.transaction_id IS NULL
     AND NEW.status = 'booked' THEN
    NEW.status := CASE
      WHEN NEW.ocr_data IS NOT NULL THEN 'processed'
      ELSE 'pending'
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_receipts_buchung_zuruecknehmen ON receipts;
CREATE TRIGGER trg_receipts_buchung_zuruecknehmen
  BEFORE UPDATE OF transaction_id ON receipts
  FOR EACH ROW EXECUTE FUNCTION beleg_buchung_zuruecknehmen();


-- ============================================================
-- TEIL D – Bestand bereinigen
-- ============================================================
-- Was vor dieser Migration schon verwaist ist, faellt sonst nie auf.

UPDATE invoices
   SET status = 'open', paid_date = NULL
 WHERE status = 'paid' AND transaction_id IS NULL;

UPDATE incoming_invoices
   SET status = 'open', paid_date = NULL
 WHERE status = 'paid' AND transaction_id IS NULL;

UPDATE receipts
   SET status = CASE WHEN ocr_data IS NOT NULL THEN 'processed' ELSE 'pending' END
 WHERE status = 'booked' AND transaction_id IS NULL;


-- ============================================================
-- KONTROLLE
-- ============================================================
--   -- Muss jeweils 0 liefern:
--   SELECT count(*) FROM invoices          WHERE status='paid'   AND transaction_id IS NULL;
--   SELECT count(*) FROM incoming_invoices WHERE status='paid'   AND transaction_id IS NULL;
--   SELECT count(*) FROM receipts          WHERE status='booked' AND transaction_id IS NULL;
--
--   -- Probe: Buchung einer bezahlten Rechnung löschen, danach muss
--   -- die Rechnung wieder auf 'open' stehen.
-- ============================================================
