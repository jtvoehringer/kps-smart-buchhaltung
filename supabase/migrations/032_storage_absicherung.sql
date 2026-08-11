-- ============================================================
-- KPS Smart Buchhaltung – Migration 032
-- Belegpfade und Logo-Bucket absichern
--
-- Behebt F-16 und F-17:
--
--   F-16  receipts.file_url wird von der Oberflaeche gesetzt und in
--         /api/ocr/process mit dem Service-Role-Schluessel geladen –
--         also unter Umgehung der Storage-Policies. Wer einen
--         receipts-Datensatz mit einem fremden Pfad anlegt, haette den
--         Beleg eines anderen Mandanten durch die Texterkennung
--         schicken und das Ergebnis zurueckbekommen koennen.
--         Die Route prueft den Pfad jetzt; diese Migration zieht die
--         Regel in die Datenbank nach, damit sie fuer jeden Zugriffsweg
--         gilt.
--
--   F-17  Fuer den Bucket "logos" gibt es in keiner Migration eine
--         Policy. Der Upload funktioniert trotzdem – die Regeln wurden
--         also irgendwann von Hand im Dashboard angelegt und sind
--         weder nachvollziehbar noch reproduzierbar. Ist eine davon
--         grosszuegig ("alle Angemeldeten duerfen schreiben"), kann
--         jeder angemeldete Benutzer das Logo eines fremden Mandanten
--         ueberschreiben – und damit dessen Rechnungen faelschen.
--
-- Idempotent. Ausfuehren in: Supabase -> SQL Editor -> Run
-- ============================================================


-- ============================================================
-- TEIL A – Belegpfad muss im eigenen Mandantenordner liegen
-- ============================================================

DO $$
BEGIN
  ALTER TABLE receipts ADD CONSTRAINT receipts_pfad_im_mandantenordner
    CHECK (file_url IS NULL OR file_url LIKE client_id::text || '/%')
    NOT VALID;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Bestand pruefen und die Regel scharf schalten, sofern er passt.
DO $$
DECLARE
  v_verstoesse INT;
BEGIN
  SELECT COUNT(*) INTO v_verstoesse
  FROM receipts
  WHERE file_url IS NOT NULL
    AND file_url NOT LIKE client_id::text || '/%';

  IF v_verstoesse = 0 THEN
    ALTER TABLE receipts VALIDATE CONSTRAINT receipts_pfad_im_mandantenordner;
    RAISE NOTICE 'Belegpfade geprüft – Regel ist scharf.';
  ELSE
    RAISE WARNING '% Beleg(e) liegen außerhalb des eigenen Mandantenordners. Die Regel gilt ab sofort für neue Datensätze; der Bestand ist zu prüfen: SELECT id, client_id, file_url FROM receipts WHERE file_url NOT LIKE client_id::text || ''/%%'';', v_verstoesse;
  END IF;
END $$;


-- ============================================================
-- TEIL B – Alte, von Hand angelegte Logo-Policies entfernen
-- ============================================================
-- Die Namen sind unbekannt, deshalb ueber den Inhalt: alles auf
-- storage.objects, dessen Bedingung den Bucket "logos" nennt.

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND (COALESCE(qual, '') || COALESCE(with_check, '')) LIKE '%logos%'
  LOOP
    EXECUTE format('DROP POLICY %I ON storage.objects', r.policyname);
    RAISE NOTICE 'Alte Logo-Policy entfernt: %', r.policyname;
  END LOOP;
END $$;


-- ============================================================
-- TEIL C – Logo-Policies sauber neu setzen
-- ============================================================
-- Lesen darf jeder: der Bucket ist oeffentlich, weil das Logo per
-- getPublicUrl ins Rechnungs-PDF eingebunden wird und ohnehin auf
-- jeder verschickten Rechnung steht. Schreiben darf nur, wer zum
-- Mandanten gehoert – (storage.foldername(name))[1] ist die client_id.

CREATE POLICY "logos: Logo lesen"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'logos');

CREATE POLICY "logos: Klient lädt eigenes Logo hoch"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'logos'
    AND (storage.foldername(name))[1] IN (
      SELECT cid::text FROM get_my_client_ids() AS cid
    )
  );

CREATE POLICY "logos: Klient ersetzt eigenes Logo"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'logos'
    AND (storage.foldername(name))[1] IN (
      SELECT cid::text FROM get_my_client_ids() AS cid
    )
  )
  WITH CHECK (
    bucket_id = 'logos'
    AND (storage.foldername(name))[1] IN (
      SELECT cid::text FROM get_my_client_ids() AS cid
    )
  );

CREATE POLICY "logos: Klient löscht eigenes Logo"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'logos'
    AND (storage.foldername(name))[1] IN (
      SELECT cid::text FROM get_my_client_ids() AS cid
    )
  );

CREATE POLICY "logos: Superadmin verwaltet alle Logos"
  ON storage.objects FOR ALL
  TO authenticated
  USING (bucket_id = 'logos' AND is_superadmin())
  WITH CHECK (bucket_id = 'logos' AND is_superadmin());


-- Bucket-Grenzen nachziehen (SVG entfaellt: kann Skript enthalten und
-- wird oeffentlich ausgeliefert).
UPDATE storage.buckets
SET public             = true,
    file_size_limit    = 2097152,
    allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp']
WHERE id = 'logos';


-- ============================================================
-- KONTROLLE
-- ============================================================
--   SELECT policyname, cmd FROM pg_policies
--   WHERE schemaname='storage' AND tablename='objects'
--     AND policyname LIKE 'logos:%' ORDER BY policyname;
--
--   SELECT conname, convalidated FROM pg_constraint
--   WHERE conrelid = 'receipts'::regclass
--     AND conname = 'receipts_pfad_im_mandantenordner';
--
-- Danach in der App testen:
--   1. Einstellungen -> Logo hochladen        -> muss gehen
--   2. Rechnung als PDF ansehen               -> Logo muss erscheinen
--   3. Beleg hochladen und erkennen lassen    -> muss gehen
-- ============================================================
