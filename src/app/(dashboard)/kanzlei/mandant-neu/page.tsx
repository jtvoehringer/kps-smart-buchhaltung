// Neuen Mandanten anlegen – /kanzlei/mandant-neu
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import MandantNeuForm from './MandantNeuForm';

export default async function MandantNeuPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: me } = await supabase
    .from('users')
    .select('role, tenant_id')
    .eq('id', user.id)
    .maybeSingle();

  if (!me || !['admin', 'kanzlei', 'superadmin', 'superadmin'].includes(me.role)) redirect('/dashboard');

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-navy tracking-[-0.01em]">Neuen Mandanten anlegen</h1>
        <p className="text-ink-2 text-sm">Mandant wird angelegt und erhält eine Einladungs-E-Mail</p>
      </div>
      <MandantNeuForm tenantId={me.tenant_id} />
    </div>
  );
}
