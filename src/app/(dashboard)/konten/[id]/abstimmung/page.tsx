export const dynamic = 'force-dynamic';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { Scale } from 'lucide-react';
import AbstimmungClient from './AbstimmungClient';

export default async function KontoabstimmungPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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

  const { data: account } = await admin
    .from('accounts')
    .select('*')
    .eq('id', id)
    .eq('client_id', membership.client_id)
    .maybeSingle();

  if (!account) notFound();

  // Buchungen bis einschließlich des Stichtags stecken bereits im
  // Eröffnungssaldo und dürfen im Saldenlauf nicht noch einmal zählen.
  let abfrage = admin
    .from('transactions')
    .select('id, booking_date, created_at, description, type, amount_gross, is_private, is_reconciled, beleg_jahr, beleg_nr, category:categories(name)')
    .eq('client_id', membership.client_id)
    .eq('account_id', id);

  if (account.opening_date) {
    abfrage = abfrage.gt('booking_date', account.opening_date);
  }

  // Umbuchungen (Migration 042) betreffen dieses Konto als Quelle ODER
  // Ziel – gleiche Stichtagslogik wie bei den Buchungen.
  let umbAbfrage = admin
    .from('account_transfers')
    .select('*')
    .eq('client_id', membership.client_id)
    .or(`from_account_id.eq.${id},to_account_id.eq.${id}`);

  if (account.opening_date) {
    umbAbfrage = umbAbfrage.gt('transfer_date', account.opening_date);
  }

  // Wie viele Bewegungen liegen am oder vor dem Stichtag und stecken
  // damit im Eröffnungssaldo? Ohne Hinweis wirken sie "verschwunden".
  const verschluckteZaehlen = account.opening_date
    ? [
        admin.from('transactions')
          .select('id', { count: 'exact', head: true })
          .eq('client_id', membership.client_id)
          .eq('account_id', id)
          .lte('booking_date', account.opening_date),
        admin.from('account_transfers')
          .select('id', { count: 'exact', head: true })
          .eq('client_id', membership.client_id)
          .or(`from_account_id.eq.${id},to_account_id.eq.${id}`)
          .lte('transfer_date', account.opening_date),
      ]
    : [];

  const [{ data: transactions }, { data: transfers }, { data: alleKonten }, ...verschluckt] = await Promise.all([
    abfrage
      .order('booking_date', { ascending: false })
      .order('created_at',   { ascending: false }),
    umbAbfrage.order('transfer_date', { ascending: false }),
    admin.from('accounts').select('id, name').eq('client_id', membership.client_id),
    ...verschluckteZaehlen,
  ]);

  const imEroeffnungssaldo = verschluckt.reduce((s, r) => s + (('count' in r ? r.count : 0) ?? 0), 0);

  const kontoName = new Map((alleKonten ?? []).map(k => [k.id, k.name]));

  const rows = (transactions ?? []).map(t => ({
    kind: 'buchung' as const,
    ...t,
    category: Array.isArray(t.category) ? (t.category[0] ?? null) : t.category,
  }));

  // Umbuchungen in dieselbe Zeilenform bringen: aus Sicht DIESES Kontos
  // ist die Quelle ein Abgang (expense) und das Ziel ein Zugang (income).
  const umbuchungen = (transfers ?? []).map(u => {
    const istQuelle = u.from_account_id === id;
    const gegenName = kontoName.get(istQuelle ? u.to_account_id : u.from_account_id) ?? 'anderes Konto';
    return {
      kind: 'umbuchung' as const,
      id: u.id,
      booking_date: u.transfer_date,
      created_at: u.created_at,
      description: u.description ?? 'Umbuchung',
      type: (istQuelle ? 'expense' : 'income') as 'income' | 'expense',
      amount_gross: Number(u.amount),
      is_private: false,
      is_reconciled: istQuelle ? u.is_reconciled_from : u.is_reconciled_to,
      beleg_jahr: null,
      beleg_nr: null,
      category: null,
      richtung: (istQuelle ? 'out' : 'in') as 'out' | 'in',
      gegenkonto: gegenName,
    };
  });

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/konten" className="text-gray-400 hover:text-gray-600 transition-colors text-sm">
          ← Konten
        </Link>
        <span className="text-gray-300">/</span>
        <h1 className="text-2xl font-bold text-brand flex items-center gap-2">
          <Scale size={22} strokeWidth={1.75} className="text-accent-dark" />
          Kontoabstimmung – {account.name}
        </h1>
      </div>
      <AbstimmungClient
        accountId={account.id}
        accountName={account.name}
        rows={[...rows, ...umbuchungen]}
        openingBalance={Number(account.opening_balance ?? 0)}
        openingDate={account.opening_date ?? null}
        imEroeffnungssaldo={imEroeffnungssaldo}
      />
    </div>
  );
}
