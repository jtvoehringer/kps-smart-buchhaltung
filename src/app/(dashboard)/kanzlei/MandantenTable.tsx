'use client';

import { useState } from 'react';
import Link from 'next/link';
import { formatCurrency } from '@/lib/utils';

export type MandantRow = {
  id: string;
  company_name: string;
  uid_number: string | null;
  vat_period: string;
  is_active: boolean;
  tenantName: string;
  income: number;
  expense: number;
  count: number;
  memberCount: number;
};

export default function MandantenTable({ rows, isSuperadmin }: { rows: MandantRow[]; isSuperadmin: boolean }) {
  const [query, setQuery] = useState('');

  const q = query.trim().toLowerCase();
  const filtered = q
    ? rows.filter(r =>
        r.company_name.toLowerCase().includes(q) ||
        (r.uid_number ?? '').toLowerCase().includes(q) ||
        (isSuperadmin && r.tenantName.toLowerCase().includes(q))
      )
    : rows;

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex flex-wrap items-center gap-3 justify-between">
        <h2 className="font-semibold text-gray-800">Mandanten</h2>
        <div className="flex items-center gap-3">
          {rows.length > 0 && (
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Mandant suchen…"
              className="w-full sm:w-56 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#35609E]"
            />
          )}
          <Link
            href="/kanzlei/mandant-neu"
            className="bg-[#35609E] hover:bg-[#4F90E8] text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors whitespace-nowrap"
          >
            ➕ Neuer Mandant
          </Link>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <div className="text-4xl mb-3">👥</div>
          <p className="text-sm">Noch keine Mandanten angelegt</p>
          <p className="text-xs mt-2">
            <Link href="/kanzlei/mandant-neu" className="text-[#35609E] hover:underline">
              Ersten Mandanten anlegen →
            </Link>
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <div className="text-4xl mb-3">🔍</div>
          <p className="text-sm">Kein Mandant gefunden für „{query}"</p>
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
            {filtered.map(r => (
              <tr key={r.id} className="border-t border-gray-50 hover:bg-gray-50/50">
                <td className="px-6 py-3">
                  <Link href={`/kanzlei/mandant/${r.id}`} className="group block">
                    <div className="font-medium text-gray-800 group-hover:text-[#35609E] group-hover:underline">
                      {r.company_name}
                    </div>
                    {r.uid_number && <div className="text-xs text-gray-400">{r.uid_number}</div>}
                  </Link>
                </td>
                {isSuperadmin && (
                  <td className="px-4 py-3 text-xs text-gray-400">{r.tenantName}</td>
                )}
                <td className="px-4 py-3 text-gray-500">
                  {r.vat_period === 'monthly' ? 'Monatlich' : 'Vierteljährlich'}
                </td>
                <td className="px-4 py-3 text-right text-[#00897B]">
                  {r.income > 0 ? formatCurrency(r.income) : '—'}
                </td>
                <td className="px-4 py-3 text-right text-[#C62828]">
                  {r.expense > 0 ? formatCurrency(r.expense) : '—'}
                </td>
                <td className="px-4 py-3 text-right text-gray-600">{r.count}</td>
                <td className="px-4 py-3 text-center text-gray-500">
                  <span className="inline-flex items-center gap-1">👤 {r.memberCount}</span>
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    r.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {r.is_active ? 'Aktiv' : 'Inaktiv'}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  <Link
                    href={`/kanzlei/mandant/${r.id}`}
                    className="text-xs text-[#35609E] hover:text-[#4F90E8] font-medium hover:underline"
                  >
                    Bearbeiten
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
