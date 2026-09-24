-- ============================================================
-- KPS Smart Buchhaltung – Migration 010
-- Feature-Flags: kostenpflichtige Module pro Mandant
-- Ausführen in: Supabase → SQL Editor → Run
-- ============================================================

-- modules_enabled: Array der aktiven Module pro Klient
-- Mögliche Werte: 'invoicing' (Rechnungsmodul)
-- Nur Superadmin kann diese Spalte ändern (via Admin-Client / Service Role)
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS modules_enabled TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN clients.modules_enabled IS
  'Aktive kostenpflichtige Module. Werte: invoicing. Nur durch Superadmin setzbar.';

-- Hilfsfunktion: prüft ob ein Modul für den eingeloggten User aktiv ist
CREATE OR REPLACE FUNCTION has_module(module_name TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    module_name = ANY(
      SELECT unnest(modules_enabled)
      FROM clients
      WHERE id = get_my_client_id()
    ),
    FALSE
  )
$$;

-- ============================================================
-- FERTIG
-- ✅ modules_enabled Spalte + has_module() Funktion
-- Rechnungsmodul aktivieren für einen Klienten:
--   UPDATE clients SET modules_enabled = array_append(modules_enabled, 'invoicing')
--   WHERE id = '<client_id>';
-- Deaktivieren:
--   UPDATE clients SET modules_enabled = array_remove(modules_enabled, 'invoicing')
--   WHERE id = '<client_id>';
-- ============================================================
