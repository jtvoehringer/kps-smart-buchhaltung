-- ============================================================
-- KPS Smart Buchhaltung – Migration 040
-- Zusatzanhänge je Ausgangsrechnung
--
-- Anforderung vom 12.08.2026: Beim E-Mail-Versand einer Rechnung
-- sollen weitere Dokumente mitgehen – Leistungs- und Zeitnachweise,
-- Stundenlisten und dergleichen.
--
-- Die Anhänge werden AN DER RECHNUNG gespeichert, nicht nur beim
-- Versand flüchtig mitgegeben: so bleibt nachvollziehbar, was mit
-- der Rechnung hinausging, und ein erneuter Versand nimmt dieselben
-- Nachweise mit.
--
-- Abgelegt wird im bestehenden privaten Bucket "belege" unter
-- {client_id}/rechnungsanhaenge/{invoice_id}/… – die Storage-Policies
-- aus Migration 020 prüfen auf den Mandantenordner und decken diese
-- Pfade bereits ab. Es braucht weder einen neuen Bucket noch neue
-- Storage-Policies.
--
-- Idempotent. Ausfuehren in: Supabase -> SQL Editor -> Run
-- ============================================================


CREATE TABLE IF NOT EXISTS invoice_attachments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     UUID NOT NULL REFERENCES clients(id)  ON DELETE CASCADE,
  invoice_id    UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  file_name     TEXT NOT NULL,
  storage_path  TEXT NOT NULL,
  mime_type     TEXT,
  file_size     BIGINT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Dieselbe Regel wie bei den Belegen (Migration 032): der Pfad muss
  -- im Ordner des eigenen Mandanten liegen. Die Versandroute lädt mit
  -- dem Service-Role-Schlüssel und verlässt sich darauf.
  CONSTRAINT invoice_attachments_pfad_im_mandantenordner
    CHECK (storage_path LIKE client_id::text || '/%'),

  -- Resend erlaubt 40 MB je Mail inklusive Kodierungsaufschlag –
  -- einzelne Anhänge deckelt schon die Datenbank.
  CONSTRAINT invoice_attachments_groesse
    CHECK (file_size IS NULL OR (file_size > 0 AND file_size <= 10485760))
);

COMMENT ON TABLE invoice_attachments IS
  'Zusatzdokumente je Ausgangsrechnung (Leistungs-/Zeitnachweise). Werden beim E-Mail-Versand zusätzlich zum Rechnungs-PDF angehängt. Dateien liegen im Bucket "belege" unter {client_id}/rechnungsanhaenge/{invoice_id}/.';

CREATE INDEX IF NOT EXISTS idx_invoice_attachments_invoice
  ON invoice_attachments (invoice_id);


ALTER TABLE invoice_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Klient verwaltet Anhänge eigener Rechnungen" ON invoice_attachments;
CREATE POLICY "Klient verwaltet Anhänge eigener Rechnungen" ON invoice_attachments
  FOR ALL
  USING (client_id IN (SELECT get_my_client_ids()))
  WITH CHECK (
    client_id IN (SELECT get_my_client_ids())
    -- Der Anhang muss zu einer Rechnung DESSELBEN Mandanten gehören –
    -- sonst ließe sich ein fremdes invoice_id eintragen.
    AND invoice_id IN (SELECT id FROM invoices WHERE invoices.client_id = invoice_attachments.client_id)
  );

DROP POLICY IF EXISTS "Kanzlei liest Anhänge ihrer Mandanten" ON invoice_attachments;
CREATE POLICY "Kanzlei liest Anhänge ihrer Mandanten" ON invoice_attachments
  FOR SELECT USING (
    get_my_role() IN ('admin', 'kanzlei')
    AND client_id IN (SELECT id FROM clients WHERE tenant_id = get_my_tenant_id())
  );

DROP POLICY IF EXISTS "Superadmin: alle Rechnungsanhänge" ON invoice_attachments;
CREATE POLICY "Superadmin: alle Rechnungsanhänge" ON invoice_attachments
  FOR ALL USING (is_superadmin());


-- ============================================================
-- KONTROLLE
-- ============================================================
--   SELECT policyname, cmd FROM pg_policies
--   WHERE tablename = 'invoice_attachments' ORDER BY 1;
--
--   -- Muss scheitern (fremder Pfad):
--   -- INSERT INTO invoice_attachments (client_id, invoice_id, file_name, storage_path)
--   -- VALUES ('<client>', '<invoice>', 'x.pdf', 'anderer-mandant/x.pdf');
-- ============================================================
