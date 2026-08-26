// Umbuchung zwischen Konten – z. B. Ausgleich des Kreditkartensaldos
// vom Girokonto (vorgemerkt am 12.08.2026). Keine Einnahme/Ausgabe:
// zählt weder in UVA noch E/A-Rechnung noch BMD-Export, erscheint nur
// in den Kontoabstimmungen beider Konten.
export const dynamic = 'force-dynamic';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeftRight, CreditCard } from 'lucide-react';
import UmbuchungForm from './UmbuchungForm';

export default async function UmbuchungPage() {
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

  const { data: accounts } = await admin
    .from('accounts')
    .select('id, name, type')
    .eq('client_id', membership.client_id)
    .eq('is_active', true)
    .order('name');

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/konten" className="text-ink-3 hover:text-navy transition-colors text-sm">
          ← Konten
        </Link>
        <span className="text-ink-3">/</span>
        <h1 className="text-2xl font-semibold text-navy tracking-[-0.01em] flex items-center gap-2">
          <ArrowLeftRight size={22} strokeWidth={1.75} className="text-navy" />
          Umbuchung erfassen
        </h1>
      </div>

      {(accounts ?? []).length < 2 ? (
        <div className="card p-12 text-center">
          <CreditCard size={28} strokeWidth={1.5} className="mx-auto text-ink-3 mb-3" />
          <p className="text-ink-2 text-sm font-medium">
            Für eine Umbuchung braucht es mindestens zwei Konten.
          </p>
          <p className="text-ink-3 text-xs mt-1">
            Typischer Fall: Girokonto und Kreditkarte – der Saldoausgleich wird dann als Umbuchung erfasst.
          </p>
          <Link
            href="/konten/neu"
            className="inline-block mt-4 bg-navy text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-navy-2 transition-colors"
          >
            Konto anlegen
          </Link>
        </div>
      ) : (
        <UmbuchungForm clientId={membership.client_id} accounts={accounts ?? []} />
      )}
    </div>
  );
}
