# kps-smart-buchhaltung – Hinweise für Claude

- Migrationen: `supabase/migrations/` enthält genau die Remote-Historie als `<version>_<name>.sql` (Version = Zeitstempel aus `supabase_migrations.schema_migrations`), Projekt-Ref `efeypxiwxdffcgwewkag`. Die älteren, handnummerierten Dateien liegen unverändert in `supabase/migrations_legacy/` (bis 24.09.2026; „Migration 045“ usw. = diese Dateien).
  Neue Migrationen per Supabase-MCP `apply_migration` mit `<name>` einspielen – nicht im SQL Editor, der schreibt keine Historie –, danach die von `list_migrations` gemeldete Version übernehmen und die Datei exakt als `supabase/migrations/<version>_<name>.sql` speichern; keine eigene Nummer oder Zeitstempel erfinden. Prüfen mit `npx supabase migration list` (lokal = remote).
  Neuaufbau einer Datenbank: alle Dateien aus `migrations_legacy/` in Reihenfolge, danach nur die Dateien aus `migrations/` mit Version nach `20260923190405`.
