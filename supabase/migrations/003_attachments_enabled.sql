-- Migration 003: Belegverwaltung-Toggle
-- Fügt attachments_enabled Spalte zur clients-Tabelle hinzu
-- Ausführen in Supabase SQL-Editor

-- 1. Spalte hinzufügen (Standard: deaktiviert → opt-in)
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS attachments_enabled BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN clients.attachments_enabled IS
  'Ob Belegverwaltung (Datei-Upload pro Buchung) aktiviert ist. Standard: deaktiviert.';

-- 2. Storage-Bucket für Belege anlegen (falls nicht vorhanden)
-- Hinweis: INSERT in storage.buckets erfordert Service-Role-Rechte.
-- In Supabase Dashboard: Storage → New Bucket → Name: "belege", Private: true
--
-- Alternativ via SQL (als Service Role):
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'belege',
  'belege',
  false,           -- privat
  10485760,        -- max 10 MB pro Datei
  ARRAY['image/jpeg','image/png','image/webp','application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- 3. Storage RLS-Policies für Bucket "belege"
-- Klient kann eigene Belege hochladen
CREATE POLICY "Klient kann Belege hochladen"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'belege' AND
    auth.uid() IS NOT NULL AND
    -- Pfad-Format: {client_id}/{transaction_id}/{filename}
    (storage.foldername(name))[1] IN (
      SELECT id::text FROM clients WHERE user_id = auth.uid()
    )
  );

-- Klient kann eigene Belege lesen
CREATE POLICY "Klient kann eigene Belege lesen"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'belege' AND
    auth.uid() IS NOT NULL AND
    (storage.foldername(name))[1] IN (
      SELECT id::text FROM clients WHERE user_id = auth.uid()
    )
  );

-- Klient kann eigene Belege löschen
CREATE POLICY "Klient kann eigene Belege loeschen"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'belege' AND
    auth.uid() IS NOT NULL AND
    (storage.foldername(name))[1] IN (
      SELECT id::text FROM clients WHERE user_id = auth.uid()
    )
  );

-- Kanzlei/Admin kann alle Belege lesen
CREATE POLICY "Kanzlei liest alle Belege"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'belege' AND
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid() AND role IN ('kanzlei','admin')
    )
  );
