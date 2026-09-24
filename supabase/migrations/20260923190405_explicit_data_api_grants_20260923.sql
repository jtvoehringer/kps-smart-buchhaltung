-- Explizite Data-API-Grants (Supabase-Änderung ab 30.10.2026).
-- Spiegelt den Grant-Stand vom 23.09.2026, damit ein Neuaufbau aus den Migrationen
-- (Branch, db reset, neues Projekt) dieselben Rechte erhält. Idempotent.
do $g$
declare t text;
begin
  foreach t in array array['account_transfers','accounts','assets','attachments','bank_imports','bank_learning_rules','categories','client_branding','client_memberships','clients','customers','incoming_invoices','invoice_attachments','invoices','month_closures','receipts','recurring_transactions','suppliers','tax_returns','tenants','transactions']::text[] loop
    if to_regclass(format('public.%I', t)) is not null then
      execute format('grant select, insert, update, delete, truncate, references, trigger on table public.%I to anon, authenticated, service_role', t);
    end if;
  end loop;
  if to_regclass('public.beleg_counters') is not null then execute 'grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.beleg_counters to service_role'; end if;
  if to_regclass('public.beleg_counters') is not null then execute 'grant REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.beleg_counters to anon'; end if;
  if to_regclass('public.beleg_counters') is not null then execute 'grant REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.beleg_counters to authenticated'; end if;
  if to_regclass('public.email_log') is not null then execute 'grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.email_log to service_role'; end if;
  if to_regclass('public.email_log') is not null then execute 'grant REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.email_log to anon'; end if;
  if to_regclass('public.email_log') is not null then execute 'grant REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.email_log to authenticated'; end if;
  if to_regclass('public.invoice_counters') is not null then execute 'grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.invoice_counters to service_role'; end if;
  if to_regclass('public.invoice_counters') is not null then execute 'grant REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.invoice_counters to anon'; end if;
  if to_regclass('public.invoice_counters') is not null then execute 'grant REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.invoice_counters to authenticated'; end if;
  if to_regclass('public.users') is not null then execute 'grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.users to anon'; end if;
  if to_regclass('public.users') is not null then execute 'grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.users to authenticated'; end if;
  if to_regclass('public.users') is not null then execute 'grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.users to service_role'; end if;
  if to_regclass('public.users') is not null then execute 'grant UPDATE (full_name, language) on table public.users to authenticated'; end if;
end $g$;;
