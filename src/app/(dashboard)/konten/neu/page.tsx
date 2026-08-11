export const dynamic = 'force-dynamic';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import KontoForm from '../KontoForm';

export default async function NeuesKontoPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  const { data: membership } = await admin
    .from('client_memberships')
    .select('client_id')
    .eq('user_id', user.id)
    .order('created_at')
    .limit(1)
    .maybeSingle();

  if (!membership?.client_id) redirect('/dashboard');

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/konten" className="text-gray-400 hover:text-gray-600 transition-colors text-sm">
          ← Konten
        </Link>
        <span className="text-gray-300">/</span>
        <h1 className="text-2xl font-bold text-[#35609E]">Neues Konto</h1>
      </div>
      <KontoForm clientId={membership.client_id} />
    </div>
  );
}
