-- ============================================================
-- KPS Smart Buchhaltung – Migration 027
-- Dreispaltige Rechnungsfußzeile
--
-- Bisher gab es ein einziges Freitextfeld "invoice_footer", das als
-- ein Block unter der Rechnung landete. Unklar war, was dort
-- hingehoert – und Telefon, E-Mail, Web, IBAN und UID standen
-- verstreut im Absenderblock statt dort, wo sie auf einer
-- Geschaeftsrechnung ueblicherweise stehen: in der Fusszeile.
--
-- Neu: drei Freitextfelder fuer links, Mitte und rechts. Die
-- strukturierten Daten (Kontakt, Bankverbindung, UID) rendert die
-- Rechnung selbst in die passende Spalte; der Freitext ergaenzt sie.
--
-- Idempotent. Ausfuehren in: Supabase -> SQL Editor -> Run
-- ============================================================


ALTER TABLE client_branding
  ADD COLUMN IF NOT EXISTS invoice_footer_left   TEXT,
  ADD COLUMN IF NOT EXISTS invoice_footer_center TEXT,
  ADD COLUMN IF NOT EXISTS invoice_footer_right  TEXT;

COMMENT ON COLUMN client_branding.invoice_footer_left IS
  'Freitext linke Fußzeilenspalte – z.B. Firmenbuchnummer, Gericht, Gewerbeschein.';
COMMENT ON COLUMN client_branding.invoice_footer_center IS
  'Freitext mittlere Fußzeilenspalte – z.B. Gerichtsstand, Zahlungshinweis, Steuerberater.';
COMMENT ON COLUMN client_branding.invoice_footer_right IS
  'Freitext rechte Fußzeilenspalte – z.B. Hinweis auf Eigentumsvorbehalt oder Skonto.';


-- Bestehenden Fußzeilentext in die linke Spalte übernehmen,
-- damit nichts verlorengeht.
UPDATE client_branding
   SET invoice_footer_left = invoice_footer
 WHERE invoice_footer IS NOT NULL
   AND btrim(invoice_footer) <> ''
   AND invoice_footer_left IS NULL;


-- ============================================================
-- HINWEIS zur alten Spalte
-- ============================================================
-- invoice_footer bleibt in dieser Migration bewusst erhalten. Die
-- aktuell ausgelieferte Anwendung liest sie noch; ein Loeschen jetzt
-- wuerde die Einstellungsseite zwischen SQL-Lauf und Deploy
-- unbrauchbar machen.
--
-- Nach dem Deployment dieser Aenderung kann sie entfallen:
--
--   ALTER TABLE client_branding DROP COLUMN IF EXISTS invoice_footer;
--
-- ============================================================


-- KONTROLLE
--   SELECT client_id, invoice_footer, invoice_footer_left,
--          invoice_footer_center, invoice_footer_right
--   FROM client_branding;
