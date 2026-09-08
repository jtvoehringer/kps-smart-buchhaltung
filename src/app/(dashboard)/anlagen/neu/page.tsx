export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMyClientId } from '@/lib/supabase/get-my-client';
import AnlageForm from '../AnlageForm';

export default async function NeueAnlagePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const clientId = await getMyClientId(supabase, user.id);
  if (!clientId) redirect('/dashboard');

  return (
    <div className="px-6 py-7 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/anlagen" className="text-ink-3 hover:text-navy transition-colors text-sm">← Anlagenverzeichnis</Link>
        <span className="text-ink-3">/</span>
        <h1 className="text-2xl font-semibold text-navy tracking-[-0.01em]">Anlage erfassen</h1>
      </div>
      <AnlageForm clientId={clientId} />
    </div>
  );
}
