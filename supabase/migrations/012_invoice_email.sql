-- 012_invoice_email.sql
-- Ergänzt die Möglichkeit, Rechnungen direkt aus der App per E-Mail zu versenden.
-- Speichert, wann und an welche Adresse eine Rechnung zuletzt versendet wurde.

alter table public.invoices
  add column if not exists sent_at timestamptz null,
  add column if not exists sent_to text null;

comment on column public.invoices.sent_at is 'Zeitpunkt des letzten E-Mail-Versands der Rechnung (null = noch nicht versendet)';
comment on column public.invoices.sent_to is 'E-Mail-Adresse, an die die Rechnung zuletzt gesendet wurde';

-- Keine RLS-Policy-Änderung nötig: bestehende Policies auf "invoices" sind
-- zeilenbasiert (client_id) und decken die neuen Spalten automatisch mit ab.
