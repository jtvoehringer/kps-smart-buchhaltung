// Kanzlei-Dashboard – /kanzlei  (nur für Rolle kanzlei / admin / superadmin)
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { formatCurrency } from '@/lib/utils';
import Link from 'next/link';

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

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#1B3A6B]">
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
          <p className="text-2xl font-bold text-[#1B3A6B]">{(clients ?? []).length}</p>
        </div>
        <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">Aktive Mandanten</p>
          <p className="text-2xl font-bold text-[#00897B]">{activeCount}</p>
        </div>
        <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">Buchungen {currentYear}</p>
          <p className="text-2xl font-bold text-[#1B3A6B]">{totalBookings}</p>
        </div>
      </div>

      {/* Mandantentabelle */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-800">Mandanten</h2>
          <Link
            href="/kanzlei/mandant-neu"
            className="bg-[#1B3A6B] hover:bg-[#1565C0] text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            ➕ Neuer Mandant
          </Link>
        </div>

        {(clients ?? []).length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <div className="text-4xl mb-3">👥</div>
            <p className="text-sm">Noch keine Mandanten angelegt</p>
            <p className="text-xs mt-2">
              <Link href="/kanzlei/mandant-neu" className="text-[#1B3A6B] hover:underline">
                Ersten Mandanten anlegen →
              </Link>
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide border-b border-gray-100">
                <th className="text-left px-6 py-3">Mandant</th>
                {isSuperadmin && <th className="text-left px-4 py-3">Tenant</th>}
                <th className="text-left px-4 py-3">UVA</th>
                <th className="text-right px-4 py-3">Einnahmen</th>
                <th className="text-right px-4 py-3">Ausgaben</th>
                <th className="text-right px-4 py-3">Buchungen</th>
                <th className="text-center px-4 py-3">Benutzer</th>
                <th className="text-center px-4 py-3">Status</th>
                <th className="text-center px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {(clients ?? []).map(c => {
                const stats       = statsMap.get(c.id) ?? { income: 0, expense: 0, count: 0 };
                const memberCount = memberCountMap.get(c.id) ?? 0;
                const tenantName  = tenantMap.get(c.tenant_id) ?? '—';
                return (
                  <tr key={c.id} className="border-t border-gray-50 hover:bg-gray-50/50">
                    <td className="px-6 py-3">
                      <div className="font-medium text-gray-800">{c.company_name}</div>
                      {c.uid_number && <div className="text-xs text-gray-400">{c.uid_number}</div>}
                    </td>
                    {isSuperadmin && (
                      <td className="px-4 py-3 text-xs text-gray-400">{tenantName}</td>
                    )}
                    <td className="px-4 py-3 text-gray-500">
                      {c.vat_period === 'monthly' ? 'Monatlich' : 'Vierteljährlich'}
                    </td>
                    <td className="px-4 py-3 text-right text-[#00897B]">
                      {stats.income > 0 ? formatCurrency(stats.income) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-[#C62828]">
                      {stats.expense > 0 ? formatCurrency(stats.expense) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">{stats.count}</td>
                    <td className="px-4 py-3 text-center text-gray-500">
                      <span className="inline-flex items-center gap-1">👤 {memberCount}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        c.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {c.is_active ? 'Aktiv' : 'Inaktiv'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Link
                        href={`/kanzlei/mandant/${c.id}`}
                        className="text-xs text-[#1B3A6B] hover:text-[#1565C0] font-medium hover:underline"
                      >
                        Bearbeiten
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
