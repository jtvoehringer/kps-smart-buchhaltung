// Dashboard – zeigt Monatsübersicht wenn Client-Profil vorhanden, sonst Setup-Hinweis
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import DashboardClient from './DashboardClient';
import { getMyClientId } from '@/lib/supabase/get-my-client';

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const clientId = await getMyClientId(supabase, user.id);
  const { data: client } = !clientId ? { data: null } : await supabase
    .from('clients')
    .select('*')
    .eq('id', clientId)
    .maybeSingle();

  // Noch kein Profil → Rolle prüfen
  if (!client) {
    const { data: me } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    // Kanzlei / Admin → direkt zur Kanzlei-Übersicht
    if (me?.role === 'kanzlei' || me?.role === 'admin' || me?.role === 'superadmin') {
      redirect('/kanzlei');
    }

    // Klient ohne Profil → Willkommensseite
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="card p-10 w-full max-w-lg text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-navy text-white text-sm font-black mb-5">
            ICP
          </div>
          <h1 className="text-2xl font-semibold text-navy tracking-[-0.01em] mb-2">Willkommen!</h1>
          <p className="text-ink-2 mb-6 leading-relaxed">
            Der Login funktioniert.{' '}
            <span className="text-income font-medium">&#x2713;</span>
            <br />
            Ihr Buchführungs-Profil wird von der Kanzlei eingerichtet.
          </p>
          <p className="text-xs text-ink-3 bg-row rounded-lg px-4 py-2 inline-block">
            Eingeloggt als: {user.email}
          </p>
        </div>
      </div>
    );
  }

  // Monatssummen (aggregiert), offene Posten, Rechnungsentwürfe und der
  // UVA-Einreichstatus – Grundlage für Kennzahlen UND Aufgabenliste
  // (Design-Review Welle 3: Dashboard auf Monat + Aufgaben).
  const jahr = new Date().getFullYear();
  const [
    { data: monatssummen },
    { data: openInvoices },
    { data: openIncoming },
    { count: draftCount },
    { data: taxReturns },
  ] = await Promise.all([
    supabase.rpc('monatssummen', { p_client_id: client.id }),
    supabase
      .from('invoices')
      .select('id, invoice_number, due_date, total_gross, customers(id, name, contact_person)')
      .eq('client_id', client.id)
      .eq('status', 'open'),
    supabase
      .from('incoming_invoices')
      .select('id, vendor_name, invoice_number, due_date, amount_gross')
      .eq('client_id', client.id)
      .eq('status', 'open'),
    supabase
      .from('invoices')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', client.id)
      .eq('status', 'draft'),
    supabase
      .from('tax_returns')
      .select('period_year, period_month, status')
      .eq('client_id', client.id)
      .gte('period_year', jahr - 1),
  ]);

  return (
    <DashboardClient
      companyName={client.company_name}
      monatssummen={monatssummen ?? []}
      openInvoices={openInvoices ?? []}
      openIncoming={openIncoming ?? []}
      draftCount={draftCount ?? 0}
      vatLiable={client.vat_liable !== false}
      vatPeriod={(client.vat_period ?? 'quarterly') === 'monthly' ? 'monthly' : 'quarterly'}
      betriebsbeginn={client.betriebsbeginn ?? null}
      taxReturns={taxReturns ?? []}
    />
  );
}
