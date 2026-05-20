// ============================================================
// Dashboard  –  /dashboard
// Monatsübersicht: Einnahmen, Ausgaben, USt-Saldo
// ============================================================
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { formatCurrency } from '@/lib/utils';

const MONTHS = ['Jän','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];

export default async function DashboardPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Aktuellen Client laden
  const { data: client } = await supabase
    .from('clients')
    .select('*')
    .eq('user_id', user.id)
    .single();

  if (!client) redirect('/onboarding');

  const currentYear = new Date().getFullYear();

  // Buchungen für dieses Jahr laden
  const { data: transactions } = await supabase
    .from('transactions')
    .select('booking_date, type, amount_net, vat_amount, amount_gross')
    .eq('client_id', client.id)
    .gte('booking_date', `${currentYear}-01-01`)
    .lte('booking_date', `${currentYear}-12-31`);

  // Monatsweise aggregieren
  const monthly = MONTHS.map((label, i) => {
    const month = i + 1;
    const rows = (transactions || []).filter(
      t => new Date(t.booking_date).getMonth() + 1 === month
    );
    const income  = rows.filter(t => t.type === 'income' ).reduce((s, t) => s + Number(t.amount_gross), 0);
    const expense = rows.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount_gross), 0);
    const vat     = rows.filter(t => t.type === 'income' ).reduce((s, t) => s + Number(t.vat_amount), 0)
                  - rows.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.vat_amount), 0);
    return { label, month, income, expense, vat, balance: income - expense };
  });

  const totalIncome  = monthly.reduce((s, m) => s + m.income,  0);
  const totalExpense = monthly.reduce((s, m) => s + m.expense, 0);
  const totalVat     = monthly.reduce((s, m) => s + m.vat,     0);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#1B3A6B]">{client.company_name}</h1>
        <p className="text-gray-500 text-sm">Jahresübersicht {currentYear}</p>
      </div>

      {/* KPI-Karten */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">Einnahmen gesamt</p>
          <p className="text-2xl font-bold text-[#00897B]">{formatCurrency(totalIncome)}</p>
        </div>
        <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">Ausgaben gesamt</p>
          <p className="text-2xl font-bold text-[#C62828]">{formatCurrency(totalExpense)}</p>
        </div>
        <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">USt-Saldo</p>
          <p className={`text-2xl font-bold ${totalVat >= 0 ? 'text-[#C62828]' : 'text-[#00897B]'}`}>
            {formatCurrency(totalVat)}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">{totalVat >= 0 ? 'Zahllast' : 'Guthaben'}</p>
        </div>
      </div>

      {/* Monatstabelle */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">Monatsübersicht</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              <th className="text-left px-6 py-3">Monat</th>
              <th className="text-right px-4 py-3">Einnahmen</th>
              <th className="text-right px-4 py-3">Ausgaben</th>
              <th className="text-right px-4 py-3">Saldo</th>
              <th className="text-right px-6 py-3">USt-Saldo</th>
            </tr>
          </thead>
          <tbody>
            {monthly.map((m, i) => (
              <tr key={m.label} className={`border-t border-gray-50 hover:bg-gray-50 transition-colors ${i % 2 === 0 ? '' : 'bg-gray-50/30'}`}>
                <td className="px-6 py-3 font-medium text-gray-700">{m.label}</td>
                <td className="px-4 py-3 text-right text-[#00897B]">
                  {m.income > 0 ? formatCurrency(m.income) : '—'}
                </td>
                <td className="px-4 py-3 text-right text-[#C62828]">
                  {m.expense > 0 ? formatCurrency(m.expense) : '—'}
                </td>
                <td className={`px-4 py-3 text-right font-medium ${m.balance >= 0 ? 'text-[#00897B]' : 'text-[#C62828]'}`}>
                  {m.income > 0 || m.expense > 0 ? formatCurrency(m.balance) : '—'}
                </td>
                <td className={`px-6 py-3 text-right ${m.vat >= 0 ? 'text-[#C62828]' : 'text-[#00897B]'}`}>
                  {m.income > 0 || m.expense > 0 ? formatCurrency(m.vat) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-200 bg-[#1B3A6B]/5 font-semibold">
              <td className="px-6 py-3 text-[#1B3A6B]">Jahrestotal</td>
              <td className="px-4 py-3 text-right text-[#00897B]">{formatCurrency(totalIncome)}</td>
              <td className="px-4 py-3 text-right text-[#C62828]">{formatCurrency(totalExpense)}</td>
              <td className={`px-4 py-3 text-right ${totalIncome - totalExpense >= 0 ? 'text-[#00897B]' : 'text-[#C62828]'}`}>
                {formatCurrency(totalIncome - totalExpense)}
              </td>
              <td className={`px-6 py-3 text-right ${totalVat >= 0 ? 'text-[#C62828]' : 'text-[#00897B]'}`}>
                {formatCurrency(totalVat)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
