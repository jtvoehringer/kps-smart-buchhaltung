export const dynamic = 'force-dynamic';

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import RechnungenClient from './RechnungenClient';

export default async function RechnungenPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: membership } = await supabase
    .from('client_memberships')
    .select('client_id')
    .eq('user_id', user.id)
    .order('created_at')
    .limit(1)
    .maybeSingle();

  // Modul-Schutz: Rechnungsmodul muss aktiv sein
  if (membership?.client_id) {
    const { data: clientData } = await supabase
      .from('clients').select('modules_enabled').eq('id', membership.client_id).maybeSingle();
    const modules: string[] = (clientData as { modules_enabled?: string[] } | null)?.modules_enabled ?? [];
    if (!modules.includes('invoicing')) redirect('/dashboard');
  }

  if (!membership?.client_id) redirect('/dashboard');

  const { data: invoices } = await supabase
    .from('invoices')
    .select(`
      id, invoice_number, invoice_date, due_date, status,
      total_net, total_vat, total_gross, paid_date,
      customers ( id, name, company_name )
    `)
    .eq('client_id', membership.client_id)
    .order('invoice_date', { ascending: false });

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#35609E]">Rechnungen</h1>
          <p className="text-gray-500 text-sm">{invoices?.length ?? 0} Rechnungen gesamt</p>
        </div>
        <Link
          href="/rechnungen/neu"
          className="bg-[#35609E] hover:bg-[#4F90E8] text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
        >
          + Neue Rechnung
        </Link>
      </div>
      <RechnungenClient invoices={invoices ?? []} clientId={membership.client_id} />
    </div>
  );
}
