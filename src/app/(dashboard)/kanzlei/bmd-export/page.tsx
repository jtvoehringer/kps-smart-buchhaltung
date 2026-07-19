// BMD-Export – /kanzlei/bmd-export  (nur Kanzlei-intern: kanzlei / admin / superadmin)
export const dynamic = 'force-dynamic';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
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

  if (!me || !['admin', 'kanzlei', 'superadmin'].includes(me.role)) {
    redirect('/dashboard');
  }

  const admin = createAdminClient();
  const isSuperadmin = me.role === 'superadmin';

  let clientsQ = admin
    .from('clients')
    .select('id, company_name')
    .eq('is_active', true)
    .order('company_name');

  if (!isSuperadmin) {
    clientsQ = clientsQ.eq('tenant_id', me.tenant_id);
  }

  const { data: clients } = await clientsQ;

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#35609E]">BMD-Export</h1>
        <p className="text-gray-500 text-sm">EA-Buchungen im BMD NTCS-Format exportieren</p>
      </div>
      <BmdExportClient clients={clients ?? []} />
    </div>
  );
}
