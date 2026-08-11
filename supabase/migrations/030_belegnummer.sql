-- ============================================================
-- KPS Smart Buchhaltung – Migration 030
-- Stabile Belegnummer je Buchung
--
-- Behebt F-14:
--   Der BMD-Export vergab die Belegnummer aus dem Index der
--   Ergebnisliste (1, 2, 3 …). Dieselbe Buchung bekam damit bei
--   jedem Export eine andere Nummer, sobald sich der Zeitraum oder
--   der Bestand aenderte. Eine Buchung liess sich nicht mehr
--   eindeutig auf ihren Beleg zurueckfuehren – genau das verlangt
--   aber das Belegprinzip (§ 131 Abs. 1 Z 5 BAO: die Buchungen
--   muessen "leicht und sicher" ueberpruefbar mit den Belegen
--   verknuepft sein).
--
--   Die Nummer wird jetzt beim Anlegen der Buchung einmal vergeben
--   und bleibt danach unveraendert. Zaehlung je Mandant und Jahr.
--
-- Idempotent. Ausfuehren in: Supabase -> SQL Editor -> Run
-- ============================================================


-- ============================================================
-- TEIL A – Spalten
-- ============================================================

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS beleg_jahr INT,
  ADD COLUMN IF NOT EXISTS beleg_nr   INT;

COMMENT ON COLUMN transactions.beleg_jahr IS
  'Jahr des Belegkreises. Wird aus dem Buchungsdatum beim Anlegen bestimmt und danach nicht mehr geändert.';
COMMENT ON COLUMN transactions.beleg_nr IS
  'Laufende Belegnummer innerhalb von beleg_jahr, je Mandant. Wird einmalig vergeben und bleibt konstant (§ 131 BAO).';


-- ============================================================
-- TEIL B – Zaehler je Mandant und Jahr
-- ============================================================

CREATE TABLE IF NOT EXISTS beleg_counters (
  client_id  UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  jahr       INT  NOT NULL,
  next_nr    INT  NOT NULL DEFAULT 1 CHECK (next_nr >= 1),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (client_id, jahr)
);

COMMENT ON TABLE beleg_counters IS
  'Laufende Belegnummer je Mandant und Jahr. Wird ausschließlich vom Trigger auf transactions fortgeschrieben.';

ALTER TABLE beleg_counters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Belegzähler des eigenen Mandanten lesen" ON beleg_counters;
CREATE POLICY "Belegzähler des eigenen Mandanten lesen" ON beleg_counters
  FOR SELECT USING (client_id IN (SELECT get_my_client_ids()));

DROP POLICY IF EXISTS "Superadmin: alle Belegzähler" ON beleg_counters;
CREATE POLICY "Superadmin: alle Belegzähler" ON beleg_counters
  FOR ALL USING (is_superadmin());

REVOKE INSERT, UPDATE, DELETE ON beleg_counters FROM authenticated, anon;


-- ============================================================
-- TEIL C – Backfill fuer den Bestand
-- ============================================================
-- Reihenfolge wie in der Buchungsliste: Buchungsdatum, dann
-- Anlagezeitpunkt. Nur Buchungen ohne Nummer werden beruehrt,
-- der Lauf ist damit wiederholbar.

WITH nummeriert AS (
  SELECT t.id,
         EXTRACT(YEAR FROM t.booking_date)::INT AS jahr,
         ROW_NUMBER() OVER (
           PARTITION BY t.client_id, EXTRACT(YEAR FROM t.booking_date)
           ORDER BY t.booking_date, t.created_at, t.id
         )::INT AS nr
  FROM transactions t
  WHERE t.beleg_nr IS NULL
)
UPDATE transactions t
   SET beleg_jahr = n.jahr,
       beleg_nr   = n.nr
  FROM nummeriert n
 WHERE n.id = t.id;

-- Zaehlerstaende auf den Bestand heben (nie zurueckdrehen).
INSERT INTO beleg_counters (client_id, jahr, next_nr)
SELECT t.client_id, t.beleg_jahr, MAX(t.beleg_nr) + 1
  FROM transactions t
 WHERE t.beleg_nr IS NOT NULL
 GROUP BY t.client_id, t.beleg_jahr
ON CONFLICT (client_id, jahr) DO UPDATE
  SET next_nr = GREATEST(beleg_counters.next_nr, EXCLUDED.next_nr);


-- ============================================================
-- TEIL D – Eindeutigkeit
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS transactions_belegnr_uq
  ON transactions (client_id, beleg_jahr, beleg_nr)
  WHERE beleg_nr IS NOT NULL;


-- ============================================================
-- TEIL E – Vergabe beim Anlegen
-- ============================================================

CREATE OR REPLACE FUNCTION belegnummer_vergeben()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_jahr INT;
BEGIN
  IF NEW.beleg_nr IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_jahr := EXTRACT(YEAR FROM COALESCE(NEW.booking_date, CURRENT_DATE))::INT;

  -- Atomar: INSERT ... ON CONFLICT DO UPDATE sperrt die Zaehlerzeile
  -- und liefert die vergebene Nummer zurueck. Kein Read-Modify-Write,
  -- daher auch beim Massenimport keine Doppelvergabe.
  INSERT INTO beleg_counters (client_id, jahr, next_nr)
  VALUES (NEW.client_id, v_jahr, 2)
  ON CONFLICT (client_id, jahr) DO UPDATE
    SET next_nr    = beleg_counters.next_nr + 1,
        updated_at = NOW()
  RETURNING next_nr - 1 INTO NEW.beleg_nr;

  NEW.beleg_jahr := v_jahr;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_transactions_belegnummer ON transactions;
CREATE TRIGGER trg_transactions_belegnummer
  BEFORE INSERT ON transactions
  FOR EACH ROW EXECUTE FUNCTION belegnummer_vergeben();


-- ============================================================
-- TEIL F – Vergebene Nummer festhalten
-- ============================================================
-- Ein spaeter geaendertes Buchungsdatum darf die Belegnummer nicht
-- verschieben; sonst waere die Zuordnung zum Papierbeleg wieder hin.

CREATE OR REPLACE FUNCTION belegnummer_unveraenderlich()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.beleg_nr IS NOT NULL
     AND (NEW.beleg_nr IS DISTINCT FROM OLD.beleg_nr
       OR NEW.beleg_jahr IS DISTINCT FROM OLD.beleg_jahr) THEN
    NEW.beleg_nr   := OLD.beleg_nr;
    NEW.beleg_jahr := OLD.beleg_jahr;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_transactions_belegnummer_fix ON transactions;
CREATE TRIGGER trg_transactions_belegnummer_fix
  BEFORE UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION belegnummer_unveraenderlich();


-- ============================================================
-- KONTROLLE
-- ============================================================
--   SELECT client_id, beleg_jahr, MIN(beleg_nr), MAX(beleg_nr), COUNT(*)
--   FROM transactions GROUP BY 1, 2 ORDER BY 1, 2;
--
--   -- Luecken finden:
--   SELECT beleg_jahr, COUNT(*) AS anzahl, MAX(beleg_nr) AS hoechste
--   FROM transactions WHERE client_id = '<client-id>'
--   GROUP BY 1 HAVING COUNT(*) <> MAX(beleg_nr);
-- ============================================================
