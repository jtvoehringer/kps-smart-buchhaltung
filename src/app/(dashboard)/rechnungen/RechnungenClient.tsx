'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Pencil, Ban, X, ArrowRight, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency } from '@/lib/utils';
import { meldeFehler } from '@/lib/fehler';

type Invoice = {
  id: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  status: 'draft' | 'open' | 'paid' | 'cancelled';
  total_net: number;
  total_vat: number;
  total_gross: number;
  paid_date: string | null;
  customers: { id: string; name: string; contact_person: string | null } | null;
};

const STATUS_LABEL: Record<string, string> = {
  draft:     'Entwurf',
  open:      'Offen',
  paid:      'Bezahlt',
  cancelled: 'Storniert',
};

const STATUS_STYLE: Record<string, string> = {
  draft:     'bg-gray-100 text-gray-500',
  open:      'bg-amber-100 text-amber-700',
  paid:      'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-400',
};

export default function RechnungenClient({
  invoices,
  clientId,
}: {
  invoices: Invoice[];
  clientId: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [aktionsFehler, setAktionsFehler] = useState('');

  async function handleStorno(inv: Invoice) {
    if (!confirm(
      `Rechnung ${inv.invoice_number || '(Entwurf)'} über ${formatCurrency(Number(inv.total_gross))} wirklich stornieren?`
    )) return;
    setBusyId(inv.id);
    setAktionsFehler('');
    const { error } = await supabase.from('invoices')
      .update({ status: 'cancelled' })
      .eq('id', inv.id)
      .eq('client_id', clientId);
    setBusyId(null);
    if (meldeFehler('Rechnung stornieren', error, setAktionsFehler)) return;
    router.refresh();
  }

  async function handleLoeschen(inv: Invoice) {
    // Bewusst nur für Entwürfe. Eine finalisierte Rechnung hat eine
    // vergebene Nummer; sie zu löschen risse eine Lücke in den
    // fortlaufenden Nummernkreis (§ 11 Abs. 1 Z 2 UStG). Für alles
    // Vergebene gibt es das Storno.
    if (inv.status !== 'draft') return;
    if (!confirm(
      `Diesen Entwurf über ${formatCurrency(Number(inv.total_gross))} endgültig löschen? `
      + 'Das lässt sich nicht rückgängig machen.'
    )) return;
    setBusyId(inv.id);
    setAktionsFehler('');
    const { error } = await supabase.from('invoices')
      .delete()
      .eq('id', inv.id)
      .eq('client_id', clientId)
      .eq('status', 'draft');
    setBusyId(null);
    if (meldeFehler('Entwurf löschen', error, setAktionsFehler)) return;
    router.refresh();
  }
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const filtered = invoices.filter(inv =>
    filterStatus === 'all' ? true :
    filterStatus === 'overdue'
      ? inv.status === 'open' && new Date(inv.due_date) < today
      : inv.status === filterStatus
  );

  const totalOpen   = invoices.filter(i => i.status === 'open').reduce((s, i) => s + Number(i.total_gross), 0);
  const totalOverdue = invoices.filter(i => i.status === 'open' && new Date(i.due_date) < today).reduce((s, i) => s + Number(i.total_gross), 0);

  if (invoices.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center">
                <p className="text-gray-500 text-sm mb-4">Noch keine Rechnungen vorhanden.</p>
        <Link
          href="/rechnungen/neu"
          className="inline-block bg-brand text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-accent transition-colors"
        >
          Erste Rechnung erstellen
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {aktionsFehler && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">
          {aktionsFehler}
        </p>
      )}
      {/* Kennzahlen-Kacheln */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-1">Offen</p>
          <p className="text-xl font-bold text-amber-600">{formatCurrency(totalOpen)}</p>
          <p className="text-xs text-gray-400 mt-0.5">{(() => { const n = invoices.filter(i => i.status === 'open').length; return `${n} ${n === 1 ? 'Rechnung' : 'Rechnungen'}`; })()}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-1">Überfällig</p>
          <p className={`text-xl font-bold ${totalOverdue > 0 ? 'text-red-600' : 'text-gray-400'}`}>
            {formatCurrency(totalOverdue)}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            {(() => { const n = invoices.filter(i => i.status === 'open' && new Date(i.due_date) < today).length; return `${n} ${n === 1 ? 'Rechnung' : 'Rechnungen'}`; })()}
          </p>
        </div>
      </div>

      {/* Filter */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex flex-wrap gap-2">
        {['all','draft','open','overdue','paid','cancelled'].map(s => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filterStatus === s
                ? 'bg-brand text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {s === 'all' ? 'Alle' : s === 'overdue' ? 'Überfällig' : STATUS_LABEL[s]}
          </button>
        ))}
        <span className="ml-auto text-sm text-gray-400 self-center">{filtered.length} Einträge</span>
      </div>

      {/* Tabelle */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">Keine Rechnungen in dieser Kategorie</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide border-b border-gray-100">
                <th className="text-left px-4 py-3">Nummer</th>
                <th className="text-left px-4 py-3">Kunde</th>
                <th className="text-left px-4 py-3">Datum</th>
                <th className="text-left px-4 py-3">Fälligkeit</th>
                <th className="text-right px-4 py-3">Betrag</th>
                <th className="text-center px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(inv => {
                const isOverdue = inv.status === 'open' && new Date(inv.due_date) < today;
                const overdueDays = isOverdue
                  ? Math.floor((today.getTime() - new Date(inv.due_date).getTime()) / 86400000)
                  : 0;
                return (
                  <tr key={inv.id} className="border-t border-gray-50 hover:bg-gray-50/50">
                    <td className="px-4 py-3 font-mono font-medium">
                      <Link
                        href={`/rechnungen/${inv.id}`}
                        className="text-brand hover:underline underline-offset-2"
                        title="Rechnung öffnen"
                      >
                        {inv.invoice_number || <span className="font-sans text-gray-400 italic">Entwurf</span>}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      {inv.customers ? (
                        <Link href={`/kunden/${inv.customers.id}`} className="group block">
                          <div className="font-medium text-gray-800 group-hover:text-brand transition-colors">
                            {inv.customers.name}
                          </div>
                          {inv.customers.contact_person && (
                            <div className="text-xs text-gray-400">{inv.customers.contact_person}</div>
                          )}
                        </Link>
                      ) : (
                        <div className="font-medium text-gray-400">—</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {new Date(inv.invoice_date).toLocaleDateString('de-AT')}
                    </td>
                    <td className="px-4 py-3">
                      <div className={isOverdue ? 'text-red-600 font-medium' : 'text-gray-500'}>
                        {new Date(inv.due_date).toLocaleDateString('de-AT')}
                      </div>
                      {isOverdue && (
                        <div className="text-xs text-red-400">{overdueDays} Tage überfällig</div>
                      )}
                      {inv.status === 'paid' && inv.paid_date && (
                        <div className="text-xs text-green-600">
                          Bezahlt {new Date(inv.paid_date).toLocaleDateString('de-AT')}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-800">
                      {formatCurrency(Number(inv.total_gross))}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLE[inv.status]}`}>
                        {STATUS_LABEL[inv.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        {busyId === inv.id ? (
                          <Loader2 size={15} strokeWidth={2} className="animate-spin text-gray-300" />
                        ) : (
                          <>
                            {inv.status === 'draft' && (
                              <Link
                                href={`/rechnungen/${inv.id}/bearbeiten`}
                                title="Entwurf bearbeiten"
                                className="p-1 text-gray-300 hover:text-brand transition-colors"
                              >
                                <Pencil size={15} strokeWidth={2} />
                              </Link>
                            )}
                            {(inv.status === 'draft' || inv.status === 'open') && (
                              <button
                                onClick={() => handleStorno(inv)}
                                title="Rechnung stornieren"
                                className="p-1 text-gray-300 hover:text-amber-600 transition-colors"
                              >
                                <Ban size={15} strokeWidth={2} />
                              </button>
                            )}
                            {inv.status === 'draft' && (
                              <button
                                onClick={() => handleLoeschen(inv)}
                                title="Entwurf löschen"
                                className="p-1 text-gray-300 hover:text-red-500 transition-colors"
                              >
                                <X size={16} strokeWidth={2} />
                              </button>
                            )}
                            <Link
                              href={`/rechnungen/${inv.id}`}
                              title="Rechnung öffnen"
                              className="p-1 text-gray-300 hover:text-brand transition-colors"
                            >
                              <ArrowRight size={15} strokeWidth={2} />
                            </Link>
                          </>
                        )}
                      </div>
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
