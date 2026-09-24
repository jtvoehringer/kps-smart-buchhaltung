-- ============================================================
-- KPS Smart Buchhaltung – Migration 020
-- Storage-Policies fuer den Bucket "belege" neu aufsetzen
--
-- Behebt:
--   S-6a  "Kanzlei liest alle Belege" war tenant-blind: jeder
--         Kanzlei-Mitarbeiter konnte die Belege JEDER Kanzlei lesen
--   S-6b  Die Klienten-Policies aus Migration 003 binden an
--         clients.user_id. Seit Migration 004 laeuft der Zugriff ueber
--         client_memberships – fuer jeden per Einladung hinzugefuegten
--         Zweit-Nutzer schlagen Upload und Read deshalb fehl
--   S-6c  Migration 011 enthaelt als Kommentar Policies mit
--         "auth.uid() IS NOT NULL" – faktisch USING(true). Falls die
--         jemals angewandt wurden, kann jeder Klient die Belege jedes
--         anderen Mandanten lesen UND loeschen. Diese Migration
--         entfernt sie, falls vorhanden.
--
-- WICHTIG – vor dem Ausfuehren einmal DIAGNOSE_ist_stand.sql laufen
-- lassen und den Ist-Stand notieren. Falls dort Policy-Namen auftauchen,
-- die unten nicht in der DROP-Liste stehen, bitte melden, bevor diese
-- Migration ausgefuehrt wird.
--
-- Alle Beleg-Pfade im Code haben die Form {client_id}/...
--   BelegUpload.tsx:52              {client_id}/{transaction_id}/{datei}
--   BuchungForm.tsx:213             {client_id}/{transaction_id}/{ts}.{ext}
--   BelegeClient.tsx:131            {client_id}/{ts}_{datei}
--   NeueEingangsrechnungForm.tsx:92 {client_id}/eingangsrechnungen/{uuid}.{ext}
-- Damit ist (storage.foldername(name))[1] durchgaengig die client_id.
--
-- Idempotent: kann gefahrlos mehrfach laufen.
-- Ausfuehren in: Supabase -> SQL Editor -> Run
-- ============================================================


-- ============================================================
-- TEIL A – Alte Policies entfernen
-- ============================================================

-- A.1 – Policies aus Migration 003 (binden an clients.user_id)
DROP POLICY IF EXISTS "Klient kann Belege hochladen"      ON storage.objects;
DROP POLICY IF EXISTS "Klient kann eigene Belege lesen"   ON storage.objects;
DROP POLICY IF EXISTS "Klient kann eigene Belege loeschen" ON storage.objects;
DROP POLICY IF EXISTS "Kanzlei liest alle Belege"         ON storage.objects;

-- A.2 – Moegliche Workaround-Policies aus dem Kommentarblock in
--       Migration 011 (auth.uid() IS NOT NULL = faktisch offen fuer alle)
DROP POLICY IF EXISTS "belege_upload" ON storage.objects;
DROP POLICY IF EXISTS "belege_read"   ON storage.objects;
DROP POLICY IF EXISTS "belege_delete" ON storage.objects;
DROP POLICY IF EXISTS "belege_update" ON storage.objects;

-- A.3 – Eigene Policies dieser Migration (fuer Wiederholbarkeit)
DROP POLICY IF EXISTS "belege: Klient laedt eigene Belege hoch"  ON storage.objects;
DROP POLICY IF EXISTS "belege: Klient liest eigene Belege"       ON storage.objects;
DROP POLICY IF EXISTS "belege: Klient aktualisiert eigene Belege" ON storage.objects;
DROP POLICY IF EXISTS "belege: Klient loescht eigene Belege"     ON storage.objects;
DROP POLICY IF EXISTS "belege: Kanzlei liest Belege des eigenen Tenants" ON storage.objects;
DROP POLICY IF EXISTS "belege: Superadmin liest alle Belege"     ON storage.objects;


-- ============================================================
-- TEIL B – Neue Policies: Klientenzugriff ueber client_memberships
-- ============================================================
--
-- get_my_client_ids() ist SECURITY DEFINER (Migration 007) und liefert
-- SETOF UUID aller Mandanten, in denen der aktuelle Nutzer Mitglied ist.
-- Das ist dieselbe Quelle, die die App ueber getMyClientId() nutzt –
-- damit sind App-Sicht und Storage-Berechtigung endlich deckungsgleich.

CREATE POLICY "belege: Klient laedt eigene Belege hoch"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'belege'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] IN (
      SELECT cid::text FROM get_my_client_ids() AS cid
    )
  );

CREATE POLICY "belege: Klient liest eigene Belege"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'belege'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] IN (
      SELECT cid::text FROM get_my_client_ids() AS cid
    )
  );

-- upsert:true wird beim Logo-Upload verwendet; fuer belege ist UPDATE
-- der Vollstaendigkeit halber ebenfalls gesetzt (z. B. Metadaten)
CREATE POLICY "belege: Klient aktualisiert eigene Belege"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'belege'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] IN (
      SELECT cid::text FROM get_my_client_ids() AS cid
    )
  );

CREATE POLICY "belege: Klient loescht eigene Belege"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'belege'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] IN (
      SELECT cid::text FROM get_my_client_ids() AS cid
    )
  );


-- ============================================================
-- TEIL C – Kanzleizugriff, jetzt auf den eigenen Tenant begrenzt
-- ============================================================
--
-- Vorher wurde ausschliesslich die Rolle geprueft. Ein Mitarbeiter von
-- Kanzlei A konnte damit
--   supabase.storage.from('belege').list('<client_id-von-Kanzlei-B>')
-- aufrufen und saemtliche Belege fremder Steuerberatungsmandanten
-- herunterladen (Bruch des Mandantengeheimnisses, § 91 WTBG / DSGVO 32).

CREATE POLICY "belege: Kanzlei liest Belege des eigenen Tenants"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'belege'
    AND get_my_role() IN ('kanzlei', 'admin')
    AND (storage.foldername(name))[1] IN (
      SELECT c.id::text FROM public.clients c
      WHERE c.tenant_id = get_my_tenant_id()
    )
  );

-- Superadmin: bisher gab es fuer storage.objects UEBERHAUPT keine
-- Superadmin-Policy – die alte Kanzlei-Policy griff nur bei
-- role IN ('kanzlei','admin'), nicht bei 'superadmin'. Diese Policy
-- stellt den Zugriff explizit her (Policies sind permissiv/ODER-verknuepft).
CREATE POLICY "belege: Superadmin liest alle Belege"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'belege' AND is_superadmin());


-- ============================================================
-- TEIL D – Bucket-Grenzen sicherstellen
-- ============================================================
--
-- Die Datei- und MIME-Pruefung findet bisher ausschliesslich im Browser
-- statt (BelegeClient.tsx:122, BuchungForm.tsx:125). Der Upload geht mit
-- dem Anon-Key direkt an den Storage – ohne bucket-seitiges Limit koennte
-- ein manipulierter Client beliebig grosse Dateien ablegen.
--
-- image/heic und image/heif sind ergaenzt, weil iPhone-Fotos ueber den
-- Datei-Dialog (nicht ueber die Kamera) genau diesen MIME-Typ liefern.

UPDATE storage.buckets
SET file_size_limit    = 10485760,   -- 10 MB
    allowed_mime_types = ARRAY[
      'image/jpeg','image/png','image/webp',
      'image/heic','image/heif',
      'application/pdf'
    ],
    public = false
WHERE id = 'belege';

-- Bucket "logos" ist bewusst public (wird im Rechnungs-PDF per
-- getPublicUrl eingebunden) und wird hier nur angelegt, falls er fehlt –
-- Migration 009 beschreibt ihn nur als manuellen Dashboard-Schritt.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('logos', 'logos', true, 2097152,
        ARRAY['image/jpeg','image/png','image/webp','image/svg+xml'])
ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- KONTROLLE – nach dem Ausfuehren pruefen
-- ============================================================
--
-- Erwartet: genau die sechs "belege: ..."-Policies, sonst nichts
-- mit Bezug auf den belege-Bucket.
--
--   SELECT policyname, cmd, qual, with_check
--   FROM pg_policies
--   WHERE schemaname = 'storage' AND tablename = 'objects'
--   ORDER BY policyname;
--
-- Danach bitte in der App testen:
--   1. Als Klient einen Beleg unter /belege hochladen  -> muss gehen
--   2. Den Beleg oeffnen                                -> muss gehen
--   3. Als Kanzlei einen Mandantenbeleg oeffnen         -> muss gehen
--   4. Beleg an eine Buchung haengen (Buchung bearbeiten) -> muss gehen
--
-- Falls Schritt 1 oder 4 fehlschlaegt, ist der Nutzer vermutlich nicht
-- in client_memberships eingetragen:
--
--   SELECT u.email, c.company_name
--   FROM client_memberships m
--   JOIN users u ON u.id = m.user_id
--   JOIN clients c ON c.id = m.client_id
--   ORDER BY c.company_name, u.email;
--
-- ============================================================
