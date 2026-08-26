'use client';

import { Pencil, X, User } from 'lucide-react';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { meldeFehler } from '@/lib/fehler';
import EmptyState from '@/components/EmptyState';

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
      <EmptyState
        icon={User}
        text="Noch keine Kunden angelegt."
        hinweis="Kunden brauchst du zum Schreiben von Rechnungen."
        href="/kunden/neu"
        cta="Ersten Kunden anlegen"
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
      {/* Suche */}
      <div className="card px-4 py-3">
        <input
          type="text"
          placeholder="Suche nach Name, Firma, E-Mail, Ort…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full text-sm focus:outline-hidden text-ink placeholder-ink-3"
        />
      </div>

      {/* Liste */}
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
              {filtered.map(c => (
                <tr key={c.id} className="border-t border-line hover:bg-row">
                  <td className="px-4 py-3">
                    <Link href={`/kunden/${c.id}`} className="group block">
                      <div className="font-medium text-ink group-hover:text-navy transition-colors">{c.name}</div>
                      {c.contact_person && (
                        <div className="text-xs text-ink-3">{c.contact_person}</div>
                      )}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-ink-2">
                    {[c.street, `${c.zip ?? ''} ${c.city ?? ''}`.trim()].filter(Boolean).join(', ') || '—'}
                  </td>
                  <td className="px-4 py-3 text-ink-2">
                    {c.email && <div>{c.email}</div>}
                    {c.phone && <div className="text-xs text-ink-3">{c.phone}</div>}
                    {!c.email && !c.phone && '—'}
                  </td>
                  <td className="px-4 py-3 text-ink-2 font-mono text-xs">
                    {c.uid_number ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-right num">
                    {/* Aktionen mit Text statt reiner Icons (Design-Review Welle 3) */}
                    <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                      <Link
                        href={`/kunden/${c.id}`}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-line-2 text-ink-2 hover:bg-row transition-colors"
                      >
                        <Pencil size={13} strokeWidth={2} />
                        Bearbeiten
                      </Link>
                      <button
                        onClick={() => handleDeactivate(c.id)}
                        disabled={deletingId === c.id}
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
