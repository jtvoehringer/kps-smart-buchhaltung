'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { meldeFehler } from '@/lib/fehler';
import { Truck, Pencil, X } from 'lucide-react';
import EmptyState from '@/components/EmptyState';

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
  const [fehler, setFehler] = useState('');

  const filtered = suppliers.filter(s =>
    `${s.name} ${s.contact_person ?? ''} ${s.email ?? ''} ${s.city ?? ''}`.toLowerCase()
      .includes(search.toLowerCase())
  );

  async function handleDeactivate(id: string) {
    if (!confirm('Lieferanten wirklich deaktivieren? Er wird nicht mehr in der Liste angezeigt.')) return;
    setDeletingId(id);
    const { error: loeschFehler } = await supabase.from('suppliers')
      .update({ is_active: false })
      .eq('id', id);
    if (meldeFehler('Lieferanten deaktivieren', loeschFehler, setFehler)) return;
    router.refresh();
    setDeletingId(null);
  }

  if (suppliers.length === 0) {
    return (
      <EmptyState
        icon={Truck}
        text="Noch keine Lieferanten angelegt."
        hinweis="Lieferanten helfen beim Erfassen von Eingangsrechnungen."
        href="/lieferanten/neu"
        cta="Ersten Lieferanten anlegen"
      />
    );
  }

  return (
    <div className="space-y-4">
      {fehler && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">
          {fehler}
        </p>
      )}
      <div className="card px-4 py-3">
        <input
          type="text"
          placeholder="Suche nach Name, Firma, E-Mail, Ort…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full text-sm focus:outline-hidden text-ink placeholder-ink-3"
        />
      </div>

      <div className="card overflow-x-auto">
        {filtered.length === 0 ? (
          <div className="text-center py-10 text-ink-3 text-sm">Keine Treffer</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="label-mono border-b border-line-2">
                <th className="text-left px-4 py-3">Name / Firma</th>
                <th className="text-left px-4 py-3">Adresse</th>
                <th className="text-left px-4 py-3">Kontakt</th>
                <th className="text-left px-4 py-3">UID</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => (
                <tr key={s.id} className="border-t border-line hover:bg-row">
                  <td className="px-4 py-3">
                    <Link href={`/lieferanten/${s.id}`} className="group block">
                      <div className="font-medium text-ink group-hover:text-navy transition-colors">{s.name}</div>
                      {s.contact_person && (
                        <div className="text-xs text-ink-3">{s.contact_person}</div>
                      )}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-ink-2">
                    {[s.street, `${s.zip ?? ''} ${s.city ?? ''}`.trim()].filter(Boolean).join(', ') || '—'}
                  </td>
                  <td className="px-4 py-3 text-ink-2">
                    {s.email && <div>{s.email}</div>}
                    {s.phone && <div className="text-xs text-ink-3">{s.phone}</div>}
                    {!s.email && !s.phone && '—'}
                  </td>
                  <td className="px-4 py-3 text-ink-2 font-mono text-xs">
                    {s.uid_number ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-right num">
                    {/* Aktionen mit Text statt reiner Icons (Design-Review Welle 3) */}
                    <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                      <Link
                        href={`/lieferanten/${s.id}`}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-line-2 text-ink-2 hover:bg-row transition-colors"
                      >
                        <Pencil size={13} strokeWidth={2} />
                        Bearbeiten
                      </Link>
                      <button
                        onClick={() => handleDeactivate(s.id)}
                        disabled={deletingId === s.id}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-line-2 text-ink-2 hover:text-expense hover:border-expense/30 hover:bg-expense/5 transition-colors disabled:opacity-50"
                      >
                        <X size={13} strokeWidth={2} />
                        Deaktivieren
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
