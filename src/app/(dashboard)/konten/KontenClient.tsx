'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { meldeFehler } from '@/lib/fehler';
import { CreditCard, Pencil, X, Scale } from 'lucide-react';

type AccountType = 'kontokorrent' | 'kreditkarte' | 'kreditkonto';

type Account = {
  id: string;
  name: string;
  type: AccountType;
  iban: string | null;
  note: string | null;
  is_active: boolean;
};

const TYPE_LABELS: Record<AccountType, string> = {
  kontokorrent: 'Kontokorrent',
  kreditkarte:  'Kreditkarte',
  kreditkonto:  'Kreditkonto',
};

const TYPE_BADGE: Record<AccountType, string> = {
  kontokorrent: 'bg-blue-50 text-blue-700',
  kreditkarte:  'bg-purple-50 text-purple-700',
  kreditkonto:  'bg-amber-50 text-amber-700',
};

export default function KontenClient({ accounts }: { accounts: Account[] }) {
  const router = useRouter();
  const supabase = createClient();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [fehler, setFehler] = useState('');

  async function handleDeactivate(id: string) {
    if (!confirm('Konto wirklich deaktivieren? Es wird nicht mehr in der Liste angezeigt.')) return;
    setDeletingId(id);
    const { error: loeschFehler } = await supabase.from('accounts')
      .update({ is_active: false })
      .eq('id', id);
    if (meldeFehler('Konten deaktivieren', loeschFehler, setFehler)) return;
    router.refresh();
    setDeletingId(null);
  }

  if (accounts.length === 0) {
    return (
      <div className="card p-12 text-center">
        <CreditCard size={32} strokeWidth={1.5} className="text-ink-3 mx-auto mb-3" />
        <p className="text-ink-2 text-sm mb-4">Noch keine Konten angelegt.</p>
        <Link
          href="/konten/neu"
          className="inline-block bg-navy text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-navy-2 transition-colors"
        >
          Erstes Konto anlegen
        </Link>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      {fehler && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">
          {fehler}
        </p>
      )}
      <table className="w-full text-sm">
        <thead>
          <tr className="label-mono border-b border-line-2">
            <th className="text-left px-4 py-3">Bezeichnung</th>
            <th className="text-left px-4 py-3">Art</th>
            <th className="text-left px-4 py-3">IBAN</th>
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody>
          {accounts.map(a => (
            <tr key={a.id} className="border-t border-line hover:bg-row">
              <td className="px-4 py-3 font-medium text-ink">{a.name}</td>
              <td className="px-4 py-3">
                <span className={`text-xs font-medium px-2 py-1 rounded-lg ${TYPE_BADGE[a.type]}`}>
                  {TYPE_LABELS[a.type]}
                </span>
              </td>
              <td className="px-4 py-3 text-ink-2 font-mono text-xs">{a.iban ?? '—'}</td>
              <td className="px-4 py-3 text-right num">
                <div className="flex items-center justify-end gap-3">
                  <Link
                    href={`/konten/${a.id}/abstimmung`}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-navy hover:text-navy transition-colors"
                    title="Kontoabstimmung"
                  >
                    <Scale size={14} strokeWidth={1.75} />
                    Abstimmung
                  </Link>
                  <Link
                    href={`/konten/${a.id}`}
                    className="text-ink-3 hover:text-navy transition-colors"
                    title="Bearbeiten"
                  >
                    <Pencil size={15} strokeWidth={1.75} />
                  </Link>
                  <button
                    onClick={() => handleDeactivate(a.id)}
                    disabled={deletingId === a.id}
                    className="text-ink-3 hover:text-red-500 transition-colors disabled:opacity-50"
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
    </div>
  );
}
