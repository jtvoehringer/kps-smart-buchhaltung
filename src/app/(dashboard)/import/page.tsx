export const dynamic = 'force-dynamic';

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getMyClientId } from '@/lib/supabase/get-my-client';
import ImportClient from './ImportClient';

export default async function ImportPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const clientId = await getMyClientId(supabase, user.id);
  if (!clientId) redirect('/dashboard');

  const { data: categories } = await supabase
    .from('categories')
    .select('id, name, type, vat_rate')
    .order('type')
    .order('sort_order');

  // Bereits importierte bank_refs für diesen Client laden (Deduplizierung im UI)
  const { data: existingRefs } = await supabase
    .from('transactions')
    .select('bank_ref')
    .eq('client_id', clientId)
    .not('bank_ref', 'is', null);

  const knownBankRefs = new Set<string>(
    (existingRefs ?? []).map(r => r.bank_ref as string).filter(Boolean)
  );

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#35609E]">Bankdaten importieren</h1>
        <p className="text-gray-500 text-sm">
          CAMT.053 (XML) oder Bank-CSV — Buchungen werden automatisch auf Duplikate geprüft
        </p>
      </div>
      <ImportClient
        clientId={clientId}
        userId={user.id}
        categories={categories ?? []}
        knownBankRefs={Array.from(knownBankRefs)}
      />
    </div>
  );
}
