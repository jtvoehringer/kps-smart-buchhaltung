-- ============================================================
-- KPS Smart Buchhaltung – Migration 038
-- clients.booking_mode nachtragen
--
-- Behebt F-26:
--   Die Spalte wird an sieben Stellen gelesen und in den
--   Einstellungen geschrieben – sie entscheidet, ob Buchungen
--   netto oder brutto erfasst werden. In keiner Migration kommt
--   sie vor. In database.types.ts stand der Grund als Kommentar:
--
--     booking_mode: string;  // 'netto' | 'brutto' – Migration via Supabase Dashboard
--
--   Sie wurde also von Hand im Dashboard angelegt. In der laufenden
--   Datenbank ist sie da und alles funktioniert; in einer aus den
--   Migrationen aufgebauten Datenbank fehlt sie. Dort liefert
--   PostgREST fuer jede Abfrage, die sie mitselektiert, einen
--   Fehler – der im Code als `client = null` ankommt und still
--   auf 'netto' zurueckfaellt. Die Einstellung waere ohne jede
--   Fehlermeldung wirkungslos.
--
--   Genau so entsteht Drift: die laufende Datenbank ist mehr als
--   das, was im Repository steht, und niemand merkt es, bis jemand
--   neu aufsetzt.
--
--   Diese Migration aendert an einer bestehenden Datenbank nichts
--   (die Spalte ist dort schon da) – sie holt sie nur in die
--   Versionsverwaltung.
--
-- Idempotent. Ausfuehren in: Supabase -> SQL Editor -> Run
-- ============================================================

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS booking_mode TEXT NOT NULL DEFAULT 'netto';

COMMENT ON COLUMN clients.booking_mode IS
  'Erfassungsart für Buchungen und Rechnungspositionen: "netto" (Beträge ohne USt eingeben) oder "brutto" (inkl. USt, die Anwendung rechnet heraus). Wird unter Einstellungen gesetzt.';

-- Vorhandene Werte pruefen, bevor die Regel scharf wird.
DO $$
DECLARE
  v_fremd INT;
BEGIN
  SELECT COUNT(*) INTO v_fremd
  FROM clients
  WHERE booking_mode IS NULL OR booking_mode NOT IN ('netto', 'brutto');

  IF v_fremd > 0 THEN
    RAISE WARNING '% Mandant(en) haben einen unerwarteten Wert in booking_mode. Die Prüfregel wird nicht gesetzt. Bitte ansehen: SELECT id, company_name, booking_mode FROM clients WHERE booking_mode NOT IN (''netto'', ''brutto'');', v_fremd;
    RETURN;
  END IF;

  BEGIN
    ALTER TABLE clients ADD CONSTRAINT clients_booking_mode_check
      CHECK (booking_mode IN ('netto', 'brutto'));
    RAISE NOTICE 'Prüfregel für booking_mode gesetzt.';
  EXCEPTION
    WHEN duplicate_object THEN
      RAISE NOTICE 'Prüfregel für booking_mode war schon vorhanden.';
  END;
END $$;


-- ============================================================
-- KONTROLLE
-- ============================================================
--   SELECT company_name, booking_mode FROM clients ORDER BY 1;
--
--   SELECT conname FROM pg_constraint
--   WHERE conrelid = 'clients'::regclass AND conname = 'clients_booking_mode_check';
-- ============================================================
