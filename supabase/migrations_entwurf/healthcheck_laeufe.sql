-- Kunden-Health-Check (Welle 10): Prüfläufe der betreuten Kunden-Websites.
-- Der tägliche Morgenlauf (geplante Aufgabe in der Claude-App) schreibt über
-- POST /api/healthcheck (Token in HEALTHCHECK_TOKEN) mit der Service Role.
-- Lesen dürfen nur Superadmins (ICP); Kunden-Mandanten sehen die Tabelle nicht.
-- Felder und Bedeutung: src/lib/healthcheck.ts.
--
-- ENTWURF: noch nicht eingespielt. Nach Jörgens OK per Supabase-MCP
-- apply_migration (Name: healthcheck_laeufe) einspielen, dann diese Datei als
-- supabase/migrations/<version>_healthcheck_laeufe.sql ablegen (siehe CLAUDE.md).

CREATE TABLE IF NOT EXISTS healthcheck_laeufe (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firma            TEXT NOT NULL,
  domain           TEXT NOT NULL,
  datum            TIMESTAMPTZ NOT NULL,
  ampel            TEXT NOT NULL,
  db_mb            NUMERIC(10,1),
  seiten_ms_max    INTEGER,
  ssl_tage         INTEGER,
  plugin_updates   INTEGER,
  wartestellung    INTEGER,
  bearbeitung      INTEGER,
  as_fehler        INTEGER,
  alarme           TEXT,
  neu              TEXT,
  warnungen        TEXT,
  bekannt          TEXT,
  zusammenfassung  TEXT,
  bericht          TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT healthcheck_ampel   CHECK (ampel IN ('gruen', 'gelb', 'rot')),
  CONSTRAINT healthcheck_firma   CHECK (btrim(firma) <> ''),
  CONSTRAINT healthcheck_domain  CHECK (btrim(domain) <> ''),
  -- ein Lauf je Domain und Zeitpunkt: ein wiederholter POST legt keine Doublette an
  CONSTRAINT healthcheck_lauf_eindeutig UNIQUE (domain, datum)
);
COMMENT ON TABLE healthcheck_laeufe IS 'Kunden-Health-Check: ein Prüflauf je Firma/Domain und Zeitpunkt (Morgenlauf). Punkte-Listen mit " | " getrennt.';
CREATE INDEX IF NOT EXISTS idx_healthcheck_firma_datum ON healthcheck_laeufe (firma, datum DESC);

ALTER TABLE healthcheck_laeufe ENABLE ROW LEVEL SECURITY;

-- Nur lesen, nur Superadmin. Schreiben ausschließlich über die API-Route (Service Role).
DROP POLICY IF EXISTS "Superadmin liest Health-Check-Läufe" ON healthcheck_laeufe;
CREATE POLICY "Superadmin liest Health-Check-Läufe" ON healthcheck_laeufe
  FOR SELECT USING (is_superadmin());

-- ---------- Data-API-Grants (Supabase-Regel ab 30.10.2026) ---------------
REVOKE ALL ON TABLE public.healthcheck_laeufe FROM anon;
GRANT SELECT ON TABLE public.healthcheck_laeufe TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.healthcheck_laeufe TO service_role;

-- ---------- Startdaten (echte Messungen vom 24.11.2026) -------------------
INSERT INTO healthcheck_laeufe
  (firma, domain, datum, ampel, db_mb, seiten_ms_max, ssl_tage, plugin_updates, wartestellung, bearbeitung, as_fehler,
   alarme, neu, warnungen, bekannt, zusammenfassung)
VALUES
  ('hetych.at', 'www.hetych.at', '2026-11-24 09:15:00+01', 'rot', 2320, NULL, 81, 2, 0, 4, 32,
   'Datenbank 2.320 MB, Hoster-Grenze 1.000 MB (Meldung Hinteregger) | Lookup-Tabelle wc_product_attributes_lookup 1.996 MB',
   NULL, NULL, NULL,
   'Datenbank durch Lookup-Tabelle auf 2,3 GB angewachsen. Tabelle um 09:37 geleert und entfernt (324 MB).'),
  ('hetych.at', 'www.hetych.at', '2026-11-24 19:05:00+01', 'gelb', 324, 1208, 81, 2, 0, 4, 32,
   NULL,
   'DMARC-Eintrag beginnt mit einem Leerzeichen (Mail an Reichl verschickt) | Systemsicherung vom 23.11. fehlte in Site Tools',
   NULL,
   'Veraltete Theme-Vorlagen | Hintergrund-Updates kritisch | 2 Plugin-Updates (AH zuständig) | 32 alte Hintergrundfehler',
   'Erstlauf von Hand: keine Alarme, Seiten 0,6–1,2 s, neue Bestellungen abgeschlossen.')
ON CONFLICT (domain, datum) DO NOTHING;
