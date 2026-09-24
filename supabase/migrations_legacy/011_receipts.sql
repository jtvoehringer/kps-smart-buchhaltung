-- ============================================================
-- Migration 011 – OCR Belegverwaltung
-- receipts-Tabelle + RLS + Storage-Bucket Hinweis
-- ============================================================

-- ── 1. receipts ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS receipts (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id      UUID        NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  file_name      TEXT        NOT NULL,
  file_url       TEXT        NOT NULL,           -- Supabase Storage URL
  file_type      TEXT        NOT NULL DEFAULT 'image/jpeg', -- MIME-Typ
  file_size      INT,                             -- Bytes
  status         TEXT        NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending','processing','processed','booked','error')),
  ocr_data       JSONB,                           -- Extrahierte Felder (siehe unten)
  ocr_error      TEXT,                            -- Fehlermeldung falls OCR fehlschlug
  transaction_id UUID        REFERENCES transactions(id) ON DELETE SET NULL,
  notes          TEXT,
  uploaded_by    UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ocr_data JSONB-Struktur (zur Dokumentation):
-- {
--   "datum":        "2025-03-15",       -- ISO-Datum
--   "betrag_brutto": 120.00,            -- Bruttobetrag
--   "mwst_satz":    20,                 -- 0 / 10 / 13 / 20
--   "beschreibung": "Büromaterial",     -- Kurzbeschreibung
--   "lieferant":    "Stationery GmbH",  -- Lieferant/Aussteller
--   "typ":          "ausgabe"           -- "einnahme" | "ausgabe"
-- }

-- Updated-at Trigger
CREATE OR REPLACE FUNCTION update_receipts_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS receipts_updated_at ON receipts;
CREATE TRIGGER receipts_updated_at
  BEFORE UPDATE ON receipts
  FOR EACH ROW EXECUTE FUNCTION update_receipts_updated_at();

-- Indexes
CREATE INDEX IF NOT EXISTS receipts_client_id_idx        ON receipts(client_id);
CREATE INDEX IF NOT EXISTS receipts_status_idx           ON receipts(status);
CREATE INDEX IF NOT EXISTS receipts_transaction_id_idx   ON receipts(transaction_id);
CREATE INDEX IF NOT EXISTS receipts_created_at_idx       ON receipts(created_at DESC);

-- ── 2. RLS aktivieren ───────────────────────────────────────
ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;

-- Klienten sehen nur eigene Belege
CREATE POLICY "receipts_select" ON receipts
  FOR SELECT USING (
    client_id IN (
      SELECT cm.client_id FROM client_memberships cm WHERE cm.user_id = auth.uid()
    )
  );

CREATE POLICY "receipts_insert" ON receipts
  FOR INSERT WITH CHECK (
    client_id IN (
      SELECT cm.client_id FROM client_memberships cm WHERE cm.user_id = auth.uid()
    )
  );

CREATE POLICY "receipts_update" ON receipts
  FOR UPDATE USING (
    client_id IN (
      SELECT cm.client_id FROM client_memberships cm WHERE cm.user_id = auth.uid()
    )
  );

CREATE POLICY "receipts_delete" ON receipts
  FOR DELETE USING (
    client_id IN (
      SELECT cm.client_id FROM client_memberships cm WHERE cm.user_id = auth.uid()
    )
  );

-- ── 3. Storage-Bucket (manuell anlegen!) ────────────────────
-- Im Supabase Dashboard → Storage → New Bucket:
--   Name:   belege
--   Public: NEIN (private – Belege sind vertraulich!)
--
-- Dann im SQL-Editor:
--
-- INSERT INTO storage.buckets (id, name, public)
-- VALUES ('belege', 'belege', false)
-- ON CONFLICT (id) DO NOTHING;
--
-- Storage RLS (nach Bucket-Erstellung ausführen):
--
-- CREATE POLICY "belege_upload" ON storage.objects
--   FOR INSERT WITH CHECK (
--     bucket_id = 'belege'
--     AND auth.uid() IS NOT NULL
--   );
--
-- CREATE POLICY "belege_read" ON storage.objects
--   FOR SELECT USING (
--     bucket_id = 'belege'
--     AND auth.uid() IS NOT NULL
--   );
--
-- CREATE POLICY "belege_delete" ON storage.objects
--   FOR DELETE USING (
--     bucket_id = 'belege'
--     AND auth.uid() IS NOT NULL
--   );
