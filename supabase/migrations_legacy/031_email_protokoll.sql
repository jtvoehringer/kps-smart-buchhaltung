-- ============================================================
-- KPS Smart Buchhaltung – Migration 031
-- Versandprotokoll und Mengenbegrenzung für E-Mails
--
-- Behebt F-15:
--   /api/app-einladung und /api/rechnungen/[id]/send verschicken über
--   die Absenderdomaene der Kanzlei. Beide Routen pruefen nur, dass
--   jemand angemeldet ist – wie oft und an wen, war unbegrenzt. Ein
--   einzelner Zugang haette damit ueber die Reputation der Kanzlei
--   beliebig viele Mails an beliebige Adressen schicken koennen.
--
--   Ein reiner Zaehler im Anwendungsspeicher haette nicht gereicht:
--   auf Vercel laeuft jede Anfrage moeglicherweise in einer eigenen
--   Instanz. Der Zaehler muss in die Datenbank.
--
--   Der Eintrag ist zugleich der Nachweis, wann an welche Adresse
--   etwas hinausgegangen ist.
--
-- Idempotent. Ausfuehren in: Supabase -> SQL Editor -> Run
-- ============================================================


CREATE TABLE IF NOT EXISTS email_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  user_id     UUID,
  zweck       TEXT NOT NULL,
  empfaenger  TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE email_log IS
  'Protokoll aller aus der Anwendung versendeten E-Mails. Dient der Mengenbegrenzung und als Nachweis des Versands.';

CREATE INDEX IF NOT EXISTS idx_email_log_limit
  ON email_log (client_id, zweck, created_at DESC);

ALTER TABLE email_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Eigenes Versandprotokoll lesen" ON email_log;
CREATE POLICY "Eigenes Versandprotokoll lesen" ON email_log
  FOR SELECT USING (client_id IN (SELECT get_my_client_ids()));

DROP POLICY IF EXISTS "Superadmin: gesamtes Versandprotokoll" ON email_log;
CREATE POLICY "Superadmin: gesamtes Versandprotokoll" ON email_log
  FOR ALL USING (is_superadmin());

-- Geschrieben wird ausschliesslich ueber die Funktion unten.
REVOKE INSERT, UPDATE, DELETE ON email_log FROM authenticated, anon;


-- ============================================================
-- Zaehlen und protokollieren in einem Schritt
-- ============================================================
-- Wird von den API-Routen mit dem Service-Role-Schluessel aufgerufen.
-- Die Ausnahme bei erreichtem Limit ist Absicht: so kann der Aufrufer
-- nicht versehentlich weitermachen.

CREATE OR REPLACE FUNCTION email_versand_protokollieren(
  p_client_id  UUID,
  p_user_id    UUID,
  p_zweck      TEXT,
  p_empfaenger TEXT,
  p_limit      INT DEFAULT 50,
  p_fenster    INTERVAL DEFAULT INTERVAL '1 hour'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_bisher INT;
BEGIN
  IF p_client_id IS NULL OR COALESCE(btrim(p_empfaenger), '') = '' THEN
    RAISE EXCEPTION 'Mandant und Empfänger sind erforderlich.';
  END IF;

  SELECT COUNT(*) INTO v_bisher
  FROM email_log
  WHERE client_id = p_client_id
    AND zweck     = p_zweck
    AND created_at > NOW() - p_fenster;

  IF v_bisher >= p_limit THEN
    RAISE EXCEPTION 'Versand-Limit erreicht: % E-Mails dieser Art pro Stunde. Bitte später erneut versuchen.', p_limit;
  END IF;

  INSERT INTO email_log (client_id, user_id, zweck, empfaenger)
  VALUES (p_client_id, p_user_id, p_zweck, btrim(p_empfaenger));
END;
$$;

REVOKE ALL ON FUNCTION email_versand_protokollieren(UUID, UUID, TEXT, TEXT, INT, INTERVAL)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION email_versand_protokollieren(UUID, UUID, TEXT, TEXT, INT, INTERVAL)
  TO service_role;

COMMENT ON FUNCTION email_versand_protokollieren(UUID, UUID, TEXT, TEXT, INT, INTERVAL) IS
  'Protokolliert einen E-Mail-Versand und weist ihn ab, sobald das Limit im Zeitfenster erreicht ist. Nur für den Service-Role-Zugang.';


-- ============================================================
-- KONTROLLE
-- ============================================================
--   SELECT zweck, COUNT(*), MAX(created_at)
--   FROM email_log GROUP BY 1;
--
--   -- Limit greift:
--   SELECT email_versand_protokollieren('<client-id>', NULL, 'test', 'a@b.at', 1);
--   SELECT email_versand_protokollieren('<client-id>', NULL, 'test', 'a@b.at', 1);  -- muss scheitern
-- ============================================================
