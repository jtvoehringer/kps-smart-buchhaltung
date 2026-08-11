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
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 w-full max-w-lg text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[#35609E] text-white text-sm font-black mb-5">
            KPS
          </div>
          <h1 className="text-2xl font-bold text-[#35609E] mb-2">Willkommen!</h1>
          <p className="text-gray-500 mb-6 leading-relaxed">
            Der Login funktioniert.{' '}
            <span className="text-[#00897B] font-medium">&#x2713;</span>
            <br />
            Ihr Buchführungs-Profil wird von der Kanzlei eingerichtet.
          </p>
          <p className="text-xs text-gray-400 bg-gray-50 rounded-lg px-4 py-2 inline-block">
            Eingeloggt als: {user.email}
          </p>
        </div>
      </div>
    );
  }

  // Alle Buchungen laden (alle Jahre) + offene Posten für die Überfällig-Anzeige
  const [{ data: transactions }, { data: openInvoices }, { data: openIncoming }] = await Promise.all([
    supabase
      .from('transactions')
      .select('booking_date, type, amount_net, vat_amount, amount_gross')
      .eq('client_id', client.id)
      // Privatumsätze zählen steuerlich nicht mit (F-5)
      .eq('is_private', false)
      .order('booking_date', { ascending: true }),
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
  ]);

  return (
    <DashboardClient
      companyName={client.company_name}
      transactions={transactions ?? []}
      openInvoices={openInvoices ?? []}
      openIncoming={openIncoming ?? []}
    />
  );
}
