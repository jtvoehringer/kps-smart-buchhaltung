-- ============================================================
-- KPS Smart Buchhaltung – Migration 039
-- clients.attachments_enabled entfernen
--
-- Behebt F-27:
--   Der Schema-Abgleich hat gezeigt, dass die Spalte in der
--   laufenden Datenbank gar nicht existiert – Migration 003 ist dort
--   nie gelaufen. Aufgefallen ist das nie, weil die Spalte auch
--   nirgends gelesen wird: sie steht ausschliesslich in
--   database.types.ts.
--
--   Gedacht war sie als Schalter fuer die Belegablage. Diese Rolle
--   hat seit Migration 010 `modules_enabled` uebernommen, und seit
--   Migration 015 prueft die Anwendung selbst darauf nicht mehr.
--   Die Spalte ist damit dreifach ueberholt.
--
--   Statt eine tote Spalte in die Produktion nachzutragen, damit die
--   Migrationen "stimmen", faellt sie hier ueberall weg. Danach sind
--   Datenbank und Migrationen deckungsgleich – und zwar auf dem
--   kleineren, richtigen Stand.
--
--   Auch der Rest von Migration 003 ist erledigt: den Bucket "belege"
--   legt Migration 020 an, dessen Storage-Policies hat 020 vollstaendig
--   ersetzt. 003 wird nur noch der Vollstaendigkeit halber mitgefuehrt.
--
-- Idempotent. Ausfuehren in: Supabase -> SQL Editor -> Run
-- ============================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clients'
      AND column_name = 'attachments_enabled'
  ) THEN
    ALTER TABLE clients DROP COLUMN attachments_enabled;
    RAISE NOTICE 'Spalte clients.attachments_enabled entfernt.';
  ELSE
    RAISE NOTICE 'Spalte clients.attachments_enabled war nicht vorhanden – nichts zu tun.';
  END IF;
END $$;


-- ============================================================
-- KONTROLLE
-- ============================================================
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'clients' ORDER BY 1;
--   -- attachments_enabled darf nicht mehr vorkommen
-- ============================================================
