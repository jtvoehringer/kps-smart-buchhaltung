// BMD-Export – /bmd-export
// Design-Review-Entscheidung vom 12.08.2026: der Export gehört zum
// Monatsabschluss und wird vom Klienten angestoßen. Kanzlei-Rollen
// sehen weiterhin die Mandantenauswahl.
export const dynamic = 'force-dynamic';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import { getMyClientId } from '@/lib/supabase/get-my-client';
import BmdExportClient from './BmdExportClient';

export default async function BmdExportPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: me } = await supabase
    .from('users')
    .select('role, tenant_id')
    .eq('id', user.id)
    .maybeSingle();

  if (!me) redirect('/dashboard');

  let clients: { id: string; company_name: string }[] = [];

  if (['admin', 'kanzlei', 'superadmin'].includes(me.role)) {
    const admin = createAdminClient();
    let clientsQ = admin
      .from('clients')
      .select('id, company_name')
      .eq('is_active', true)
      .order('company_name');
    if (me.role !== 'superadmin') {
      clientsQ = clientsQ.eq('tenant_id', me.tenant_id);
    }
    const { data } = await clientsQ;
    clients = data ?? [];
  } else {
    // Klient: nur der eigene Betrieb, keine Auswahl.
    const clientId = await getMyClientId(supabase, user.id);
    if (!clientId) redirect('/dashboard');
    const { data } = await supabase
      .from('clients')
      .select('id, company_name')
      .eq('id', clientId)
      .maybeSingle();
    if (!data) redirect('/dashboard');
    clients = [data];
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-navy tracking-[-0.01em]">BMD-Export</h1>
        <p className="text-ink-2 text-sm">
          EA-Buchungen im BMD NTCS-Format für die Kanzlei exportieren
        </p>
      </div>
      <BmdExportClient clients={clients} />
    </div>
  );
}
