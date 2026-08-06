// Offene Posten (Ausgangsrechnungen) – /offene-posten
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getMyClientId } from '@/lib/supabase/get-my-client';
import { Wallet, Info } from 'lucide-react';
import OffenePostenClient from './OffenePostenClient';

export default async function OffenePostenPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const clientId = await getMyClientId(supabase, user.id);
  const { data: client } = !clientId ? { data: null } : await supabase
    .from('clients')
    .select('id, company_name, modules_enabled')
    .eq('id', clientId)
    .maybeSingle();

  if (!client) redirect('/dashboard');

  const hasInvoicing = (client.modules_enabled ?? []).includes('invoicing');

  const [{ data: invoices }, { data: categories }] = hasInvoicing
    ? await Promise.all([
        supabase
          .from('invoices')
          .select(`
            id, invoice_number, invoice_date, due_date, status,
            total_net, total_vat, total_gross,
            customers ( id, name, company_name )
          `)
          .eq('client_id', client.id)
          .eq('status', 'open')
          .order('due_date', { ascending: true }),
        supabase
          .from('categories')
          .select('id, name, type, vat_rate')
          .order('type')
          .order('sort_order'),
      ])
    : [{ data: [] }, { data: [] }];

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#35609E] flex items-center gap-2">
          <Wallet size={24} strokeWidth={1.75} className="text-accent-dark" />
          Offene Posten
        </h1>
        <p className="text-gray-500 text-sm mt-0.5">{client.company_name}</p>
      </div>

      {!hasInvoicing ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-10 text-center">
          <Info size={32} strokeWidth={1.5} className="text-gray-300 mx-auto mb-3" />
          <p className="text-gray-600 font-medium">Rechnungsmodul ist nicht aktiviert</p>
          <p className="text-sm text-gray-400 mt-2 max-w-md mx-auto">
            Offene Ausgangsrechnungen erscheinen hier, sobald das Modul „Rechnungen&quot; für dieses Konto
            aktiviert ist. Eingangsrechnungen (Lieferantenrechnungen) folgen in einem späteren Ausbauschritt.
          </p>
        </div>
      ) : (
        <OffenePostenClient
          invoices={invoices ?? []}
          categories={(categories ?? []).filter(c => c.type === 'income')}
          clientId={client.id}
        />
      )}
    </div>
  );
}
