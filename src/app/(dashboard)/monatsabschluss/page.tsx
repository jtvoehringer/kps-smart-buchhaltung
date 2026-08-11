export const dynamic = 'force-dynamic';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import { CalendarCheck } from 'lucide-react';
import MonatsabschlussClient from './MonatsabschlussClient';

const MONAT_NAMEN = [
  'Jänner', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

export default async function MonatsabschlussPage() {
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
  const clientId = membership.client_id;

  const { data: me } = await supabase.from('users').select('role').eq('id', user.id).maybeSingle();
  const role = me?.role ?? 'klient';
  const canReopen = ['admin', 'kanzlei', 'superadmin'].includes(role);

  // Letzte 13 Monate (aktueller Monat + 12 davor)
  const now = new Date();
  const periods: { year: number; month: number }[] = [];
  for (let i = 0; i < 13; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    periods.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
  }
  const earliest = periods[periods.length - 1];
  const rangeStart = `${earliest.year}-${String(earliest.month).padStart(2, '0')}-01`;

  const { data: transactions } = await admin
    .from('transactions')
    .select('booking_date, type, amount_gross')
    .eq('client_id', clientId)
    .gte('booking_date', rangeStart);

  const { data: closures } = await admin
    .from('month_closures')
    .select('period_year, period_month, closed_at, reopened_at')
    .eq('client_id', clientId)
    .gte('period_year', earliest.year);

  const months = periods.map(({ year, month }) => {
    const inMonth = (transactions ?? []).filter(t => {
      const d = new Date(t.booking_date);
      return d.getFullYear() === year && d.getMonth() + 1 === month;
    });
    const income = inMonth.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount_gross), 0);
    const expense = inMonth.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount_gross), 0);

    const closure = (closures ?? []).find(c => c.period_year === year && c.period_month === month);
    const closed = !!closure && !closure.reopened_at;

    return {
      year, month,
      label: `${MONAT_NAMEN[month - 1]} ${year}`,
      txCount: inMonth.length,
      income, expense,
      closed,
      closedAt: closure?.closed_at ?? null,
    };
  });

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#35609E] flex items-center gap-2">
          <CalendarCheck size={24} strokeWidth={1.75} className="text-accent-dark" />
          Monatsabschluss
        </h1>
        <p className="text-gray-500 text-sm">
          Abgeschlossene Monate sind gegen nachträgliche Buchungen gesperrt (Beleg-OCR, Offene Posten, Bank-Import und manuelle Erfassung) – so bleibt z.B. die UVA konsistent.
        </p>
      </div>
      <MonatsabschlussClient clientId={clientId} months={months} canReopen={canReopen} />
    </div>
  );
}
