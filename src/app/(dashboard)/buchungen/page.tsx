// Buchungsliste – /buchungen
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import BuchungslisteClient from './BuchungslisteClient';
import { getMyClientId } from '@/lib/supabase/get-my-client';
import { ClipboardList, Plus, Tags } from 'lucide-react';

export default async function BuchungslistePage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const { year: yearParam } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const clientId = await getMyClientId(supabase, user.id);
  const { data: client } = !clientId ? { data: null } : await supabase
    .from('clients')
    .select('id, company_name')
    .eq('id', clientId)
    .maybeSingle();

  if (!client) redirect('/dashboard');

  const currentYear = new Date().getFullYear();
  const year = Math.max(2000, Math.min(currentYear + 1, Number(yearParam) || currentYear));

  // Nur das gewählte Jahr laden – deutlich weniger Daten als alle Jahre
  const { data: transactions } = await supabase
    .from('transactions')
    .select(`
      id, type, amount_net, vat_rate, vat_amount, amount_gross,
      booking_date, description, is_locked, is_private, is_eauto,
      beleg_jahr, beleg_nr,
      categories ( name )
    `)
    .eq('client_id', client.id)
    .gte('booking_date', `${year}-01-01`)
    .lte('booking_date', `${year}-12-31`)
    .order('booking_date', { ascending: false });

  // Verfügbare Jahre (leichte Abfrage – nur Datum)
  const { data: allDates } = await supabase
    .from('transactions')
    .select('booking_date')
    .eq('client_id', client.id);

  const availableYears = Array.from(
    new Set((allDates ?? []).map(t => new Date(t.booking_date).getFullYear()))
  ).sort((a, b) => b - a);

  if (!availableYears.includes(year) && availableYears.length > 0) {
    availableYears.push(year);
    availableYears.sort((a, b) => b - a);
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-brand flex items-center gap-2">
            <ClipboardList size={24} strokeWidth={1.75} className="text-accent-dark" />
            Buchungen
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">{client.company_name}</p>
        </div>
        <div className="flex items-center gap-4">
          <Link
            href="/buchungen/kategorien"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-brand transition-colors"
          >
            <Tags size={16} strokeWidth={2} />
            Kategorien
          </Link>
          <Link
            href="/buchungen/neu"
            className="inline-flex items-center gap-1.5 bg-brand hover:bg-accent text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors"
          >
            <Plus size={16} strokeWidth={2} />
            Neue Buchung
          </Link>
        </div>
      </div>
      <BuchungslisteClient
        transactions={transactions ?? []}
        year={year}
        availableYears={availableYears.length > 0 ? availableYears : [year]}
      />
    </div>
  );
}
