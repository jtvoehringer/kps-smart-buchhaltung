-- ============================================================
-- KPS Smart Buchhaltung – Migration 034
-- Eröffnungssaldo je Konto
--
-- Behebt F-19:
--   Die Kontoabstimmung laesst den Saldenlauf bei null beginnen und
--   addiert nur die erfassten Buchungen. Der angezeigte "Kontostand"
--   stimmt damit nie mit dem Kontoauszug ueberein, sobald das Konto
--   schon vor der Inbetriebnahme der Anwendung bestand – also
--   praktisch immer. Abstimmen heisst aber genau das: den eigenen
--   Stand gegen den der Bank halten. Ohne Eroeffnungssaldo ist die
--   Seite fuer ihren Zweck unbrauchbar.
--
--   Bei Kreditkarten und Kreditkonten ist der Eroeffnungssaldo
--   ueblicherweise negativ – deshalb keine Vorzeichenbeschraenkung.
--
-- Idempotent. Ausfuehren in: Supabase -> SQL Editor -> Run
-- ============================================================

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS opening_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS opening_date    DATE;

COMMENT ON COLUMN accounts.opening_balance IS
  'Saldo des Kontos am Stichtag opening_date, laut Kontoauszug. Grundlage des Saldenlaufs in der Kontoabstimmung. Bei Kreditkarten und Kreditkonten in der Regel negativ.';
COMMENT ON COLUMN accounts.opening_date IS
  'Stichtag des Eröffnungssaldos. Buchungen bis einschließlich dieses Datums gelten als im Saldo enthalten und werden im Saldenlauf nicht noch einmal gezählt.';


-- Wer noch keinen Stichtag hinterlegt hat, bekommt keinen gesetzt:
-- ein geratenes Datum waere schlimmer als gar keines. Ohne Stichtag
-- zaehlt die Anwendung alle Buchungen ab dem Eroeffnungssaldo.


-- ============================================================
-- KONTROLLE
-- ============================================================
--   SELECT name, type, opening_date, opening_balance FROM accounts
--   ORDER BY name;
--
--   -- Gegenprobe zum Kontoauszug:
--   SELECT a.name,
--          a.opening_balance
--          + COALESCE(SUM(CASE WHEN t.type = 'income'
--                              THEN t.amount_gross ELSE -t.amount_gross END), 0) AS saldo
--   FROM accounts a
--   LEFT JOIN transactions t
--     ON t.account_id = a.id
--    AND (a.opening_date IS NULL OR t.booking_date > a.opening_date)
--   GROUP BY a.id, a.name, a.opening_balance
--   ORDER BY a.name;
-- ============================================================
