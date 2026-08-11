-- ============================================================
-- KPS Smart Buchhaltung – Migration 022
-- Rechnungsnummer mit Jahres-Suffix und jährlichem Zählerlauf
--
-- Ziel: RE-001/26, RE-002/26 … und ab 1.1.2027 wieder RE-001/27.
--
-- Entscheidungen:
--   * Das Jahr kommt aus dem RECHNUNGSDATUM, nicht aus dem Tagesdatum.
--     Eine am 3.1.2027 finalisierte Rechnung mit Rechnungsdatum
--     28.12.2026 bekommt /26 – passend zur Buchungsperiode.
--   * Das Suffix ist je Mandant konfigurierbar (Platzhalter {JJ}/{JJJJ}).
--   * Der Zähler startet genau dann jährlich neu, wenn das Suffix einen
--     Jahresplatzhalter enthält. Bewusst KEIN eigener Schalter: ein
--     jährlicher Reset ohne Jahr in der Nummer würde doppelte
--     Rechnungsnummern erzeugen (§ 11 Abs. 1 Z 2 UStG).
--
-- Idempotent. Ausfuehren in: Supabase -> SQL Editor -> Run
-- ============================================================


-- ============================================================
-- TEIL A – CHECK aus Migration 021 scharf schalten
-- ============================================================
-- Der Constraint wurde als NOT VALID angelegt, weil damals noch eine
-- bezahlte Testrechnung ohne Nummer existierte. Die Testdaten sind
-- abgeräumt, also kann er jetzt validiert werden.
DO $$
BEGIN
  ALTER TABLE invoices VALIDATE CONSTRAINT invoices_nr_required_when_open;
  RAISE NOTICE 'invoices_nr_required_when_open ist jetzt validiert.';
EXCEPTION
  WHEN check_violation THEN
    RAISE WARNING 'Es gibt noch Rechnungen ohne Nummer, die nicht Entwurf sind – Constraint bleibt NOT VALID. Bitte prüfen: SELECT id, status FROM invoices WHERE status <> ''draft'' AND invoice_number IS NULL;';
  WHEN undefined_object THEN
    RAISE NOTICE 'Constraint nicht vorhanden – Migration 021 zuerst ausführen.';
END $$;


-- ============================================================
-- TEIL B – Suffix-Einstellung je Mandant
-- ============================================================

ALTER TABLE client_branding
  ADD COLUMN IF NOT EXISTS invoice_suffix TEXT NOT NULL DEFAULT '';

COMMENT ON COLUMN client_branding.invoice_suffix IS
  'Suffix der Rechnungsnummer. Platzhalter: {JJ} = zweistelliges Jahr, {JJJJ} = vierstelliges Jahr. Beispiel "/{JJ}" ergibt RE-001/26. Leer = kein Suffix. Enthält es einen Jahresplatzhalter, startet der Zähler jährlich neu.';


-- ============================================================
-- TEIL C – Zähler je Mandant und Jahr
-- ============================================================
-- client_branding.invoice_next_nr konnte nur EINEN Zähler halten.
-- Für den jährlichen Neustart braucht es einen Zähler pro Jahr.
-- Konvention: jahr = 0 ist der durchlaufende Zähler (Suffix ohne Jahr).

CREATE TABLE IF NOT EXISTS invoice_counters (
  client_id  UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  jahr       INT  NOT NULL,
  next_nr    INT  NOT NULL DEFAULT 1 CHECK (next_nr >= 1),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (client_id, jahr)
);

COMMENT ON TABLE invoice_counters IS
  'Laufende Rechnungsnummer je Mandant und Jahr. jahr = 0 bedeutet durchlaufender Zähler ohne Jahresbezug.';

ALTER TABLE invoice_counters ENABLE ROW LEVEL SECURITY;

-- Gelesen und geschrieben wird ausschliesslich ueber die SECURITY-DEFINER-
-- Funktion unten. Die Policy erlaubt nur Lesen (fuer eine spaetere Anzeige
-- in den Einstellungen), niemals direktes Schreiben aus dem Client.
DROP POLICY IF EXISTS "Zähler des eigenen Mandanten lesen" ON invoice_counters;
CREATE POLICY "Zähler des eigenen Mandanten lesen" ON invoice_counters
  FOR SELECT USING (client_id IN (SELECT get_my_client_ids()));

DROP POLICY IF EXISTS "Superadmin: alle Zähler" ON invoice_counters;
CREATE POLICY "Superadmin: alle Zähler" ON invoice_counters
  FOR ALL USING (is_superadmin());

REVOKE INSERT, UPDATE, DELETE ON invoice_counters FROM authenticated, anon;

-- Bestandsstand aus client_branding uebernehmen (jahr = 0),
-- damit bereits vergebene Nummern nicht erneut vergeben werden.
INSERT INTO invoice_counters (client_id, jahr, next_nr)
SELECT client_id, 0, GREATEST(COALESCE(invoice_next_nr, 1), 1)
FROM client_branding
ON CONFLICT (client_id, jahr) DO NOTHING;


-- ============================================================
-- TEIL D – Formatierung
-- ============================================================

CREATE OR REPLACE FUNCTION rechnungsnummer_formatieren(
  p_prefix TEXT, p_nr INT, p_digits INT, p_suffix TEXT, p_jahr INT
)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(p_prefix, 'RE-')
      || lpad(p_nr::text, GREATEST(COALESCE(p_digits, 3), 1), '0')
      || replace(
           replace(COALESCE(p_suffix, ''), '{JJJJ}', p_jahr::text),
           '{JJ}', lpad((p_jahr % 100)::text, 2, '0')
         );
$$;

COMMENT ON FUNCTION rechnungsnummer_formatieren(TEXT, INT, INT, TEXT, INT) IS
  'Setzt Präfix, laufende Nummer und Suffix zur Rechnungsnummer zusammen. Ersetzt {JJ} und {JJJJ} durch das übergebene Jahr.';


-- ============================================================
-- TEIL E – Nummernvergabe, jetzt mit Rechnungsdatum
-- ============================================================

CREATE OR REPLACE FUNCTION naechste_rechnungsnummer(
  p_client_id UUID,
  p_datum     DATE
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_prefix     TEXT;
  v_digits     INT;
  v_suffix     TEXT;
  v_jahr       INT;
  v_zaehljahr  INT;
  v_nr         INT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM client_memberships
    WHERE client_id = p_client_id AND user_id = auth.uid()
  ) AND NOT is_superadmin() THEN
    RAISE EXCEPTION 'Keine Berechtigung für diesen Mandanten.';
  END IF;

  SELECT invoice_prefix, invoice_nr_digits, invoice_suffix
    INTO v_prefix, v_digits, v_suffix
  FROM client_branding
  WHERE client_id = p_client_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Für diesen Mandanten ist kein Rechnungs-Branding hinterlegt. Bitte zuerst unter Einstellungen anlegen.';
  END IF;

  v_jahr := EXTRACT(YEAR FROM COALESCE(p_datum, CURRENT_DATE))::INT;

  -- Jährlicher Neustart nur, wenn das Jahr auch in der Nummer steht.
  v_zaehljahr := CASE
    WHEN COALESCE(v_suffix, '') LIKE '%{JJ}%'
      OR COALESCE(v_suffix, '') LIKE '%{JJJJ}%'
    THEN v_jahr
    ELSE 0
  END;

  -- Atomar: INSERT ... ON CONFLICT DO UPDATE sperrt die Zeile und
  -- liefert die vergebene Nummer zurück. Kein Read-Modify-Write.
  INSERT INTO invoice_counters (client_id, jahr, next_nr)
  VALUES (p_client_id, v_zaehljahr, 2)
  ON CONFLICT (client_id, jahr) DO UPDATE
    SET next_nr    = invoice_counters.next_nr + 1,
        updated_at = NOW()
  RETURNING next_nr - 1 INTO v_nr;

  -- client_branding.invoice_next_nr nur noch als Anzeigewert nachziehen
  UPDATE client_branding
     SET invoice_next_nr = v_nr + 1
   WHERE client_id = p_client_id;

  RETURN rechnungsnummer_formatieren(v_prefix, v_nr, v_digits, v_suffix, v_jahr);
END;
$$;

REVOKE ALL ON FUNCTION naechste_rechnungsnummer(UUID, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION naechste_rechnungsnummer(UUID, DATE) TO authenticated;

-- Alte einstellige Signatur bleibt als Wrapper bestehen, damit die
-- noch laufende Frontend-Version zwischen SQL-Lauf und Deploy nicht
-- bricht. Kann nach dem Deploy entfernt werden.
CREATE OR REPLACE FUNCTION naechste_rechnungsnummer(p_client_id UUID)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT naechste_rechnungsnummer(p_client_id, CURRENT_DATE);
$$;

REVOKE ALL ON FUNCTION naechste_rechnungsnummer(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION naechste_rechnungsnummer(UUID) TO authenticated;

COMMENT ON FUNCTION naechste_rechnungsnummer(UUID, DATE) IS
  'Vergibt atomar die nächste Rechnungsnummer für das Jahr des Rechnungsdatums, inkl. konfiguriertem Suffix.';


-- ============================================================
-- KONTROLLE
-- ============================================================
--
-- Suffix setzen (Beispiel):
--   UPDATE client_branding SET invoice_suffix = '/{JJ}' WHERE client_id = '…';
--
-- Vorschau ohne Zähler zu verbrauchen:
--   SELECT rechnungsnummer_formatieren('RE-', 1, 3, '/{JJ}', 2026);   -- RE-001/26
--   SELECT rechnungsnummer_formatieren('RE-', 47, 4, '/{JJJJ}', 2026);-- RE-0047/2026
--   SELECT rechnungsnummer_formatieren('RE-', 5, 3, '', 2026);        -- RE-005
--
-- Aktueller Zählerstand:
--   SELECT c.company_name, ic.jahr, ic.next_nr
--   FROM invoice_counters ic JOIN clients c ON c.id = ic.client_id
--   ORDER BY c.company_name, ic.jahr;
--
-- ============================================================
