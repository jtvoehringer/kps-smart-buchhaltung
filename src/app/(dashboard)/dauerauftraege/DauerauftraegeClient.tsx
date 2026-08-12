'use client';

import { X, Pause, Play, Repeat } from 'lucide-react';

import { useState } from 'react';
import { useServerState } from '@/lib/useServerState';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import EmptyState from '@/components/EmptyState';

type RecurringTransaction = {
  id: string;
  name: string;
  type: 'income' | 'expense';
  amount_net: number;
  vat_rate: number;
  interval: 'monthly' | 'quarterly' | 'semi-annual' | 'annual';
  day_of_month: number;
  next_run_date: string;
  is_active: boolean;
  category_id: string;
  categories: { name: string } | null;
};

const INTERVAL_LABELS: Record<string, string> = {
  monthly:     'Monatlich',
  quarterly:   'Vierteljährlich',
  'semi-annual': 'Halbjährlich',
  annual:      'Jährlich',
};

function eur(val: number) {
  return new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR' }).format(val);
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('de-AT');
}

export default function DauerauftraegeClient({
  recurring,
  bookingMode,
}: {
  recurring: RecurringTransaction[];
  bookingMode: string;
}) {
  const supabase = createClient();
  const [items, setItems] = useServerState<RecurringTransaction[]>(recurring);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function toggleActive(item: RecurringTransaction) {
    setLoadingId(item.id);
    setError('');
    const { error: err } = await supabase
      .from('recurring_transactions')
      .update({ is_active: !item.is_active })
      .eq('id', item.id);
    if (err) {
      setError('Fehler beim Aktualisieren: ' + err.message);
    } else {
      setItems(prev => prev.map(r => r.id === item.id ? { ...r, is_active: !r.is_active } : r));
    }
    setLoadingId(null);
  }

  async function deleteItem(item: RecurringTransaction) {
    if (!confirm(`Dauerauftrag "${item.name}" wirklich löschen?`)) return;
    setLoadingId(item.id);
    setError('');
    const { error: err } = await supabase
      .from('recurring_transactions')
      .delete()
      .eq('id', item.id);
    if (err) {
      setError('Fehler beim Löschen: ' + err.message);
    } else {
      setItems(prev => prev.filter(r => r.id !== item.id));
    }
    setLoadingId(null);
  }

  const active   = items.filter(r => r.is_active);
  const inactive = items.filter(r => !r.is_active);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Link
          href="/dauerauftraege/neu"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-brand hover:bg-[#152d54] transition-colors shadow-sm"
        >
          <span>＋</span>
          <span>Neuer Dauerauftrag</span>
        </Link>
      </div>

      {error && (
        <p className="text-red-600 text-sm bg-red-50 px-4 py-2.5 rounded-xl border border-red-200">{error}</p>
      )}

      {items.length === 0 ? (
        <EmptyState
          icon={Repeat}
          text="Keine Daueraufträge"
          hinweis="Wiederkehrende Buchungen werden automatisch täglich verarbeitet."
          href="/dauerauftraege/neu"
          cta="Ersten Dauerauftrag anlegen"
        />
      ) : (
        <>
          {active.length > 0 && (
            <RecurringSection
              title="Aktive Daueraufträge"
              items={active}
              loadingId={loadingId}
              onToggle={toggleActive}
              onDelete={deleteItem}
            />
          )}
          {inactive.length > 0 && (
            <RecurringSection
              title="Inaktive Daueraufträge"
              items={inactive}
              loadingId={loadingId}
              onToggle={toggleActive}
              onDelete={deleteItem}
              muted
            />
          )}
        </>
      )}

      <div className="text-xs text-gray-400 text-center pt-2">
        Daueraufträge werden täglich um 06:00 Uhr UTC automatisch als Buchungen erfasst.
      </div>
    </div>
  );
}

function RecurringSection({
  title, items, loadingId, onToggle, onDelete, muted = false,
}: {
  title: string;
  items: RecurringTransaction[];
  loadingId: string | null;
  onToggle: (item: RecurringTransaction) => void;
  onDelete: (item: RecurringTransaction) => void;
  muted?: boolean;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className={`px-5 py-3 border-b border-gray-100 ${muted ? 'bg-gray-50' : 'bg-white'}`}>
        <h2 className={`text-sm font-semibold ${muted ? 'text-gray-400' : 'text-gray-700'}`}>{title}</h2>
      </div>
      <div className="divide-y divide-gray-50">
        {items.map(item => (
          <RecurringRow
            key={item.id}
            item={item}
            loading={loadingId === item.id}
            onToggle={onToggle}
            onDelete={onDelete}
            muted={muted}
          />
        ))}
      </div>
    </div>
  );
}

function RecurringRow({
  item, loading, onToggle, onDelete, muted,
}: {
  item: RecurringTransaction;
  loading: boolean;
  onToggle: (item: RecurringTransaction) => void;
  onDelete: (item: RecurringTransaction) => void;
  muted: boolean;
}) {
  const gross = item.amount_net * (1 + item.vat_rate / 100);
  const isIncome = item.type === 'income';

  return (
    <div className={`px-5 py-4 flex items-start gap-4 ${muted ? 'opacity-60' : ''}`}>
      {/* Typ-Badge */}
      <div className={`mt-0.5 flex-shrink-0 w-2 h-2 rounded-full mt-2 ${isIncome ? 'bg-income' : 'bg-expense'}`} />

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-gray-800 text-sm">{item.name}</span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            isIncome ? 'bg-teal-50 text-teal-700' : 'bg-red-50 text-red-700'
          }`}>
            {isIncome ? '↑ Einnahme' : '↓ Ausgabe'}
          </span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">
            {INTERVAL_LABELS[item.interval] ?? item.interval}
          </span>
        </div>
        <div className="flex items-center gap-3 mt-1 flex-wrap">
          <span className="text-xs text-gray-400">{item.categories?.name ?? '—'}</span>
          <span className="text-xs text-gray-300">·</span>
          <span className="text-xs text-gray-400">Nächste Ausführung: <span className="text-gray-600 font-medium">{formatDate(item.next_run_date)}</span></span>
        </div>
      </div>

      {/* Betrag */}
      <div className="text-right flex-shrink-0">
        <div className={`text-sm font-bold ${isIncome ? 'text-income' : 'text-expense'}`}>
          {isIncome ? '+' : '−'} {eur(item.amount_net)}
        </div>
        <div className="text-xs text-gray-400">
          Netto · {item.vat_rate} % USt
        </div>
      </div>

      {/* Aktionen mit Text statt reiner Icons (Design-Review Welle 3) */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={() => onToggle(item)}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-40"
        >
          {item.is_active
            ? <><Pause size={13} strokeWidth={2} />{loading ? '…' : 'Pausieren'}</>
            : <><Play size={13} strokeWidth={2} />{loading ? '…' : 'Aktivieren'}</>}
        </button>
        <button
          onClick={() => onDelete(item)}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-500 hover:text-expense hover:border-expense/30 hover:bg-expense/5 transition-colors disabled:opacity-40"
        >
          <X size={13} strokeWidth={2} />
          Löschen
        </button>
      </div>
    </div>
  );
}
