// Kanzlei-Dashboard – /kanzlei  (nur für Rolle kanzlei / admin / superadmin)
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import MandantenTable from './MandantenTable';

export default async function KanzleiPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Rolle prüfen
  const { data: me } = await supabase
    .from('users')
    .select('role, tenant_id, full_name')
    .eq('id', user.id)
    .maybeSingle();

  if (!me || !['admin', 'kanzlei', 'superadmin'].includes(me.role)) {
    redirect('/dashboard');
  }

  const isSuperadmin = me.role === 'superadmin';
  const currentYear = new Date().getFullYear();

  // ── 1. Mandanten laden (ohne FK-ambiguous Join) ──────────────────────────
  let clientsQ = supabase
    .from('clients')
    .select('id, company_name, uid_number, vat_period, is_active, created_at, tenant_id')
    .order('company_name');

  if (!isSuperadmin) {
    clientsQ = clientsQ.eq('tenant_id', me.tenant_id);
  }

  // Tenant-Namen nur für Superadmin nachladen
  const [{ data: clients }, { data: tenants }] = await Promise.all([
    clientsQ,
    isSuperadmin
      ? supabase.from('tenants').select('id, name')
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);

  const tenantMap = new Map((tenants ?? []).map(t => [t.id, t.name]));
  const clientIds = (clients ?? []).map(c => c.id);

  // ── 2. Memberships + Buchungsstatistik parallel laden ────────────────────
  const [{ data: memberships }, { data: txStats }] = await Promise.all([
    clientIds.length > 0
      ? supabase
          .from('client_memberships')
          .select('client_id')
          .in('client_id', clientIds)
      : Promise.resolve({ data: [] as { client_id: string }[] }),
    clientIds.length > 0
      ? supabase
          .from('transactions')
          .select('client_id, type, amount_gross')
          // Privatumsätze zählen steuerlich nicht mit (F-5)
          .eq('is_private', false)
          .in('client_id', clientIds)
          .gte('booking_date', `${currentYear}-01-01`)
          .lte('booking_date', `${currentYear}-12-31`)
      : Promise.resolve({ data: [] as { client_id: string; type: string; amount_gross: number }[] }),
  ]);

  // Auswertung
  const memberCountMap = new Map<string, number>();
  for (const m of memberships ?? []) {
    memberCountMap.set(m.client_id, (memberCountMap.get(m.client_id) ?? 0) + 1);
  }

  const statsMap = new Map<string, { income: number; expense: number; count: number }>();
  for (const tx of txStats ?? []) {
    const s = statsMap.get(tx.client_id) ?? { income: 0, expense: 0, count: 0 };
    if (tx.type === 'income')  s.income  += Number(tx.amount_gross);
    if (tx.type === 'expense') s.expense += Number(tx.amount_gross);
    s.count++;
    statsMap.set(tx.client_id, s);
  }

  const activeCount    = (clients ?? []).filter(c => c.is_active).length;
  const totalBookings  = Array.from(statsMap.values()).reduce((s, v) => s + v.count, 0);

  const rows = (clients ?? []).map(c => {
    const stats       = statsMap.get(c.id) ?? { income: 0, expense: 0, count: 0 };
    const memberCount = memberCountMap.get(c.id) ?? 0;
    const tenantName  = tenantMap.get(c.tenant_id) ?? '—';
    return {
      id:            c.id,
      company_name:  c.company_name,
      uid_number:    c.uid_number,
      vat_period:    c.vat_period,
      is_active:     c.is_active,
      tenantName,
      income:        stats.income,
      expense:       stats.expense,
      count:         stats.count,
      memberCount,
    };
  });

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#35609E]">
          {isSuperadmin ? '🔑 Superadmin-Übersicht' : 'Kanzlei-Dashboard'}
        </h1>
        <p className="text-gray-500 text-sm">
          {isSuperadmin ? 'Alle Mandanten · Alle Tenants' : `Mandantenübersicht ${currentYear}`}
        </p>
      </div>

      {/* Übersichtskacheln */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">Mandanten gesamt</p>
          <p className="text-2xl font-bold text-[#35609E]">{(clients ?? []).length}</p>
        </div>
        <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">Aktive Mandanten</p>
          <p className="text-2xl font-bold text-[#00897B]">{activeCount}</p>
        </div>
        <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">Buchungen {currentYear}</p>
          <p className="text-2xl font-bold text-[#35609E]">{totalBookings}</p>
        </div>
      </div>

      {/* Mandantentabelle */}
      <MandantenTable rows={rows} isSuperadmin={isSuperadmin} />
    </div>
  );
}
