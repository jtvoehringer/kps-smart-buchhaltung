'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { meldeFehler } from '@/lib/fehler';

type Customer = {
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
  notes: string | null;
  is_active: boolean;
};

export default function KundenClient({
  customers,
  clientId,
}: {
  customers: Customer[];
  clientId: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [search, setSearch] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [fehler, setFehler] = useState('');

  const filtered = customers.filter(c =>
    `${c.name} ${c.contact_person ?? ''} ${c.email ?? ''} ${c.city ?? ''}`.toLowerCase()
      .includes(search.toLowerCase())
  );

  async function handleDeactivate(id: string) {
    if (!confirm('Kunden wirklich deaktivieren? Er wird nicht mehr in der Liste angezeigt.')) return;
    setDeletingId(id);
    const { error: loeschFehler } = await supabase.from('customers')
      .update({ is_active: false })
      .eq('id', id);
    if (meldeFehler('Kunden deaktivieren', loeschFehler, setFehler)) return;
    router.refresh();
    setDeletingId(null);
  }

  if (customers.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center">
        <div className="text-4xl mb-3">👥</div>
        <p className="text-gray-500 text-sm mb-4">Noch keine Kunden angelegt.</p>
        <Link
          href="/kunden/neu"
          className="inline-block bg-[#35609E] text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-[#4F90E8] transition-colors"
        >
          Ersten Kunden anlegen
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {fehler && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">
          {fehler}
        </p>
      )}
      {/* Suche */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3">
        <input
          type="text"
          placeholder="Suche nach Name, Firma, E-Mail, Ort…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full text-sm focus:outline-none text-gray-700 placeholder-gray-400"
        />
      </div>

      {/* Liste */}
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
              {filtered.map(c => (
                <tr key={c.id} className="border-t border-gray-50 hover:bg-gray-50/50">
                  <td className="px-4 py-3">
                    <Link href={`/kunden/${c.id}`} className="group block">
                      <div className="font-medium text-gray-800 group-hover:text-[#35609E] transition-colors">{c.name}</div>
                      {c.contact_person && (
                        <div className="text-xs text-gray-400">{c.contact_person}</div>
                      )}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {[c.street, `${c.zip ?? ''} ${c.city ?? ''}`.trim()].filter(Boolean).join(', ') || '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {c.email && <div>{c.email}</div>}
                    {c.phone && <div className="text-xs text-gray-400">{c.phone}</div>}
                    {!c.email && !c.phone && '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">
                    {c.uid_number ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/kunden/${c.id}`}
                        className="text-gray-300 hover:text-[#35609E] transition-colors"
                        title="Bearbeiten"
                      >
                        ✏️
                      </Link>
                      <button
                        onClick={() => handleDeactivate(c.id)}
                        disabled={deletingId === c.id}
                        className="text-gray-300 hover:text-red-500 transition-colors disabled:opacity-50 text-lg leading-none"
                        title="Deaktivieren"
                      >
                        &times;
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
