-- ============================================================
-- KPS Smart Buchhaltung – Migration 028
-- Absenderblock im Rechnungskopf abschaltbar
--
-- Wer ein Logo hinterlegt hat, braucht Firmenname und Adresse nicht
-- zusaetzlich im Kopf – seit Migration 027 stehen beide ohnehin in der
-- Fusszeile, zusammen mit Kontakt, Bankverbindung und UID.
--
-- Der Firmenwortlaut bleibt dadurch auf jeder Rechnung erhalten
-- (§ 11 Abs. 1 Z 1 UStG verlangt den Namen des leistenden
-- Unternehmers) – nur eben unten statt oben.
--
-- Idempotent. Ausfuehren in: Supabase -> SQL Editor -> Run
-- ============================================================

ALTER TABLE client_branding
  ADD COLUMN IF NOT EXISTS show_sender_in_header BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN client_branding.show_sender_in_header IS
  'Firmenname und Adresse im Rechnungskopf anzeigen. Bei false erscheint dort nur das Logo; die Angaben stehen weiterhin in der Fußzeile. Ohne hinterlegtes Logo wird der Absender immer angezeigt.';


-- KONTROLLE
--   SELECT client_id, logo_url IS NOT NULL AS hat_logo, show_sender_in_header
--   FROM client_branding;


-- ============================================================
-- TEIL B – Vergebene Rechnungsnummern schuetzen
-- ============================================================
-- Die RLS-Policy "Klient kann Rechnungen erstellen/bearbeiten" ist
-- FOR ALL und erlaubt damit auch DELETE. Eine finalisierte Rechnung
-- zu loeschen risse eine Luecke in den fortlaufenden Nummernkreis
-- (§ 11 Abs. 1 Z 2 UStG) – und war bisher nur durch die Oberflaeche
-- verhindert, nicht durch die Datenbank.
--
-- Entwuerfe haben noch keine Nummer und duerfen weiterhin weg.
-- Fuer alles Vergebene gibt es das Storno.

CREATE OR REPLACE FUNCTION nur_entwuerfe_loeschbar()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.status <> 'draft' THEN
    RAISE EXCEPTION 'Rechnung % kann nicht gelöscht werden – nur Entwürfe sind löschbar. Bitte stattdessen stornieren.',
      COALESCE(OLD.invoice_number, '(ohne Nummer)');
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_invoices_nur_entwuerfe_loeschbar ON invoices;
CREATE TRIGGER trg_invoices_nur_entwuerfe_loeschbar
  BEFORE DELETE ON invoices
  FOR EACH ROW EXECUTE FUNCTION nur_entwuerfe_loeschbar();


-- KONTROLLE
--   DELETE FROM invoices WHERE status = 'open';   -- muss scheitern
--   DELETE FROM invoices WHERE status = 'draft';  -- muss gehen
