'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Truck, Pencil, X } from 'lucide-react';

type Supplier = {
  id: string;
  name: string;
  contact_person: string | null;
  street: string | null;
  zip: string | null;
  city: string | null;
  country: string;
  email: string | null;
  phone: string | null;
  uid_number: string | null;
  iban: string | null;
  notes: string | null;
  is_active: boolean;
};

export default function LieferantenClient({
  suppliers,
  clientId,
}: {
  suppliers: Supplier[];
  clientId: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [search, setSearch] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const filtered = suppliers.filter(s =>
    `${s.name} ${s.contact_person ?? ''} ${s.email ?? ''} ${s.city ?? ''}`.toLowerCase()
      .includes(search.toLowerCase())
  );

  async function handleDeactivate(id: string) {
    if (!confirm('Lieferanten wirklich deaktivieren? Er wird nicht mehr in der Liste angezeigt.')) return;
    setDeletingId(id);
    await supabase.from('suppliers').update({ is_active: false }).eq('id', id);
    router.refresh();
    setDeletingId(null);
  }

  if (suppliers.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center">
        <Truck size={32} strokeWidth={1.5} className="text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500 text-sm mb-4">Noch keine Lieferanten angelegt.</p>
        <Link
          href="/lieferanten/neu"
          className="inline-block bg-[#35609E] text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-[#4F90E8] transition-colors"
        >
          Ersten Lieferanten anlegen
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3">
        <input
          type="text"
          placeholder="Suche nach Name, Firma, E-Mail, Ort…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full text-sm focus:outline-none text-gray-700 placeholder-gray-400"
        />
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-sm">Keine Treffer</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide border-b border-gray-100">
                <th className="text-left px-4 py-3">Name / Firma</th>
                <th className="text-left px-4 py-3">Adresse</th>
                <th className="text-left px-4 py-3">Kontakt</th>
                <th className="text-left px-4 py-3">UID</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => (
                <tr key={s.id} className="border-t border-gray-50 hover:bg-gray-50/50">
                  <td className="px-4 py-3">
                    <Link href={`/lieferanten/${s.id}`} className="group block">
                      <div className="font-medium text-gray-800 group-hover:text-[#35609E] transition-colors">{s.name}</div>
                      {s.contact_person && (
                        <div className="text-xs text-gray-400">{s.contact_person}</div>
                      )}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {[s.street, `${s.zip ?? ''} ${s.city ?? ''}`.trim()].filter(Boolean).join(', ') || '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {s.email && <div>{s.email}</div>}
                    {s.phone && <div className="text-xs text-gray-400">{s.phone}</div>}
                    {!s.email && !s.phone && '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">
                    {s.uid_number ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/lieferanten/${s.id}`}
                        className="text-gray-300 hover:text-[#35609E] transition-colors"
                        title="Bearbeiten"
                      >
                        <Pencil size={15} strokeWidth={1.75} />
                      </Link>
                      <button
                        onClick={() => handleDeactivate(s.id)}
                        disabled={deletingId === s.id}
                        className="text-gray-300 hover:text-red-500 transition-colors disabled:opacity-50"
                        title="Deaktivieren"
                      >
                        <X size={16} strokeWidth={2} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
