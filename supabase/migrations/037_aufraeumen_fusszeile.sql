-- ============================================================
-- KPS Smart Buchhaltung – Migration 037
-- Alte Fußzeilenspalte entfernen
--
-- Migration 027 hat den einspaltigen Fusszeilentext in die linke der
-- drei neuen Spalten uebernommen und `invoice_footer` bewusst stehen
-- lassen: die damals ausgelieferte Anwendung las die Spalte noch, ein
-- sofortiges Loeschen haette die Einstellungsseite zwischen SQL-Lauf
-- und Deployment unbrauchbar gemacht.
--
-- Der Deploy ist inzwischen draussen, das Eingabefeld existiert nicht
-- mehr. Die Spalte wurde zuletzt nur noch beschrieben, ohne dass sie
-- irgendwo gelesen wurde – ein Feld, das aussieht, als taete es
-- etwas. Genau daraus entstehen spaeter falsche Annahmen.
--
-- Idempotent. Ausfuehren in: Supabase -> SQL Editor -> Run
-- ============================================================

-- Sicherheitsnetz: nichts loeschen, was nicht uebernommen wurde.
DO $$
DECLARE
  v_offen INT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'client_branding'
      AND column_name = 'invoice_footer'
  ) THEN
    RAISE NOTICE 'Spalte invoice_footer existiert bereits nicht mehr.';
    RETURN;
  END IF;

  EXECUTE $q$
    SELECT COUNT(*) FROM client_branding
    WHERE COALESCE(btrim(invoice_footer), '') <> ''
      AND COALESCE(btrim(invoice_footer_left), '') = ''
  $q$ INTO v_offen;

  IF v_offen > 0 THEN
    RAISE EXCEPTION 'Bei % Mandant(en) steht noch Text in invoice_footer, der nicht in invoice_footer_left übernommen wurde. Bitte prüfen, bevor die Spalte entfällt: SELECT client_id, invoice_footer, invoice_footer_left FROM client_branding WHERE COALESCE(btrim(invoice_footer), '''') <> '''';', v_offen;
  END IF;

  ALTER TABLE client_branding DROP COLUMN invoice_footer;
  RAISE NOTICE 'Spalte invoice_footer entfernt.';
END $$;


-- ============================================================
-- KONTROLLE
-- ============================================================
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'client_branding' AND column_name LIKE 'invoice_footer%';
--   -- erwartet: invoice_footer_left / _center / _right
-- ============================================================
