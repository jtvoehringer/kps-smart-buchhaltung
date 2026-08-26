'use client';

// Befehlspalette (Strg+K / ⌘K) – Welle 5.
// Ein Eingabefeld für alles: Seiten aufrufen, Aktionen starten
// ("Buchung erfassen"), Kunden, Lieferanten, Rechnungen und Buchungen
// finden – von jeder Seite aus, ohne Klickpfad. Tastatur: ↑↓ wählen,
// ↵ öffnen, Esc schließen. Öffnen auch über den Knopf in der Kopfleiste
// (löst das Ereignis "sb:palette" aus).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeftRight, ClipboardList, FileText, LogOut, Plus, Receipt, Repeat,
  ScanLine, Search, Truck, User, Wallet, CreditCard,
  type LucideIcon,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency } from '@/lib/utils';
import { buildNav } from './navigation';

type Gruppe = 'Seiten' | 'Aktionen' | 'Kunden' | 'Lieferanten' | 'Rechnungen' | 'Buchungen';

type Eintrag = {
  id: string;
  gruppe: Gruppe;
  label: string;
  /** Zweite Zeile / rechte Spalte (Betrag, Datum, Status …) */
  detail?: string;
  icon: LucideIcon;
  href?: string;
  run?: () => void | Promise<void>;
  /** Zusätzliche Suchbegriffe (Synonyme) */
  keywords?: string;
};

const GRUPPEN_REIHENFOLGE: Gruppe[] = ['Aktionen', 'Seiten', 'Kunden', 'Lieferanten', 'Rechnungen', 'Buchungen'];

/** Umlaute/Akzente weg, Kleinschreibung – für tolerante Suche */
function norm(s: string) {
  return s.toLowerCase()
    .replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function passt(e: Eintrag, q: string) {
  const heu = norm(`${e.label} ${e.keywords ?? ''} ${e.detail ?? ''}`);
  return norm(q).split(/\s+/).filter(Boolean).every(w => heu.includes(w));
}

const datum = (iso: string) =>
  new Date(iso).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' });

const STATUS: Record<string, string> = { draft: 'Entwurf', open: 'Offen', paid: 'Bezahlt', cancelled: 'Storniert' };

export default function CommandPalette({ role, clientId }: { role: string; clientId: string | null }) {
  const router = useRouter();
  const [offen, setOffen] = useState(false);
  const [q, setQ] = useState('');
  const [auswahl, setAuswahl] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listeRef = useRef<HTMLDivElement>(null);
  const anfrageNr = useRef(0);

  // ── Statische Einträge: Seiten + Aktionen je Rolle ────────────────
  const statisch = useMemo<Eintrag[]>(() => {
    const seiten: Eintrag[] = buildNav(role).flatMap(g =>
      g.items.map(i => ({
        id: `s:${i.href}`, gruppe: 'Seiten' as const, label: i.label, detail: g.label, icon: i.icon, href: i.href,
        keywords: `${g.label} ${i.keywords ?? ''}`,
      })),
    );
    const darfBuchen = role === 'klient' || role === 'superadmin';
    const aktionen: Eintrag[] = darfBuchen ? [
      { id: 'a:buchung',   gruppe: 'Aktionen', label: 'Buchung erfassen',          icon: Plus,           href: '/buchungen/neu',        keywords: 'neu einnahme ausgabe beleg' },
      { id: 'a:rechnung',  gruppe: 'Aktionen', label: 'Rechnung schreiben',        icon: FileText,       href: '/rechnungen/neu',       keywords: 'neu fakturieren ausgangsrechnung' },
      { id: 'a:beleg',     gruppe: 'Aktionen', label: 'Beleg hochladen (OCR)',     icon: ScanLine,       href: '/belege',               keywords: 'scan foto' },
      { id: 'a:kunde',     gruppe: 'Aktionen', label: 'Kunde anlegen',             icon: User,           href: '/kunden/neu',           keywords: 'neu' },
      { id: 'a:lieferant', gruppe: 'Aktionen', label: 'Lieferant anlegen',         icon: Truck,          href: '/lieferanten/neu',      keywords: 'neu' },
      { id: 'a:dauer',     gruppe: 'Aktionen', label: 'Dauerauftrag anlegen',      icon: Repeat,         href: '/dauerauftraege/neu',   keywords: 'neu wiederkehrend' },
      { id: 'a:konto',     gruppe: 'Aktionen', label: 'Konto anlegen',             icon: CreditCard,     href: '/konten/neu',           keywords: 'neu bank' },
      { id: 'a:umbuchung', gruppe: 'Aktionen', label: 'Umbuchung zwischen Konten', icon: ArrowLeftRight, href: '/konten/umbuchung',     keywords: 'transfer' },
      { id: 'a:offen',     gruppe: 'Aktionen', label: 'Offene Posten prüfen',      icon: Wallet,         href: '/offene-posten',        keywords: 'überfällig zahlung' },
    ] : [];
    aktionen.push({
      id: 'a:logout', gruppe: 'Aktionen', label: 'Abmelden', icon: LogOut, keywords: 'logout ausloggen',
      run: async () => { await createClient().auth.signOut(); window.location.href = '/login'; },
    });
    return [...aktionen, ...seiten];
  }, [role]);

  // ── Öffnen/Schließen: Strg+K, ⌘K, Kopfleisten-Knopf ─────────────
  useEffect(() => {
    const oeffnen = () => { setQ(''); setAuswahl(0); setOffen(true); };
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOffen(o => { if (o) return false; setQ(''); setAuswahl(0); return true; });
      }
    };
    const onEvent = () => oeffnen();
    window.addEventListener('keydown', onKey);
    window.addEventListener('sb:palette', onEvent);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('sb:palette', onEvent); };
  }, []);

  useEffect(() => {
    if (!offen) return;
    const t = setTimeout(() => inputRef.current?.focus(), 10);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { clearTimeout(t); document.body.style.overflow = prev; };
  }, [offen]);

  // ── Suche: statische Einträge sofort (abgeleitet), Daten verzögert ─
  const frage = q.trim();
  const statischGefiltert = useMemo(() => {
    const stat = frage ? statisch.filter(e => passt(e, frage)) : statisch;
    // Treffer, deren Name mit der Eingabe beginnt, zuerst
    return frage
      ? [...stat].sort((a, b) => Number(norm(b.label).startsWith(norm(frage))) - Number(norm(a.label).startsWith(norm(frage))))
      : stat;
  }, [frage, statisch]);

  const datenSuche = frage.length >= 2 && !!clientId && (role === 'klient' || role === 'superadmin');
  // Ergebnisse tragen die Frage, zu der sie gehören – veraltete werden nicht angezeigt
  const [daten, setDaten] = useState<{ frage: string; items: Eintrag[] }>({ frage: '', items: [] });
  const sucheLaeuft = datenSuche && daten.frage !== frage;

  useEffect(() => {
    if (!offen || !datenSuche) return;
    const nr = ++anfrageNr.current;
    const t = setTimeout(async () => {
      const sb = createClient();
      const like = `%${frage.replace(/[%_]/g, '')}%`;
      const [k, l, r, b] = await Promise.all([
        sb.from('customers').select('id,name,city').eq('client_id', clientId!).eq('is_active', true).ilike('name', like).limit(5),
        sb.from('suppliers').select('id,name,city').eq('client_id', clientId!).eq('is_active', true).ilike('name', like).limit(5),
        sb.from('invoices').select('id,invoice_number,status,total_gross,invoice_date,customers(name)').eq('client_id', clientId!)
          .ilike('invoice_number', like).order('invoice_date', { ascending: false }).limit(5),
        sb.from('transactions').select('id,description,booking_date,amount_gross,type,beleg_nr,is_locked').eq('client_id', clientId!)
          .ilike('description', like).order('booking_date', { ascending: false }).limit(6),
      ]);
      if (nr !== anfrageNr.current) return; // inzwischen weitergetippt
      const items: Eintrag[] = [
        ...(k.data ?? []).map(x => ({ id: `k:${x.id}`, gruppe: 'Kunden' as const, label: x.name, detail: x.city ?? undefined, icon: User, href: `/kunden/${x.id}` })),
        ...(l.data ?? []).map(x => ({ id: `l:${x.id}`, gruppe: 'Lieferanten' as const, label: x.name, detail: x.city ?? undefined, icon: Truck, href: `/lieferanten/${x.id}` })),
        ...(r.data ?? []).map(x => {
          const kunde = (x as unknown as { customers: { name: string } | null }).customers?.name;
          return {
            id: `r:${x.id}`, gruppe: 'Rechnungen' as const,
            label: `${x.invoice_number || 'Entwurf'}${kunde ? ` · ${kunde}` : ''}`,
            detail: `${formatCurrency(Number(x.total_gross))} · ${STATUS[x.status] ?? x.status}`,
            icon: Receipt, href: `/rechnungen/${x.id}`,
          };
        }),
        ...(b.data ?? []).map(x => ({
          id: `b:${x.id}`, gruppe: 'Buchungen' as const,
          label: x.description || '(ohne Beschreibung)',
          detail: `${datum(x.booking_date)} · ${x.type === 'income' ? '+' : '−'}${formatCurrency(Number(x.amount_gross))}${x.beleg_nr ? ` · B-${x.beleg_nr}` : ''}`,
          icon: ClipboardList,
          href: x.is_locked ? '/buchungen' : `/buchungen/${x.id}/bearbeiten`,
        })),
      ];
      setDaten({ frage, items });
    }, 180);
    return () => clearTimeout(t);
  }, [frage, offen, datenSuche, clientId]);

  const treffer = useMemo(
    () => [...statischGefiltert, ...(datenSuche && daten.frage === frage ? daten.items : [])],
    [statischGefiltert, datenSuche, daten, frage],
  );

  const gruppiert = useMemo(() =>
    GRUPPEN_REIHENFOLGE.map(g => ({ g, items: treffer.filter(e => e.gruppe === g) })).filter(x => x.items.length > 0),
  [treffer]);
  const flach = useMemo(() => gruppiert.flatMap(x => x.items), [gruppiert]);

  const ausfuehren = useCallback((e: Eintrag) => {
    setOffen(false);
    if (e.run) void e.run();
    else if (e.href) router.push(e.href);
  }, [router]);

  // Tasten gelten im ganzen Fenster, solange die Palette offen ist –
  // auch wenn der Fokus durch einen Klick daneben verloren ging
  // (Meldung 26.08.2026: Esc reagierte nicht, wenn das Eingabefeld
  // nicht mehr den Fokus hatte).
  useEffect(() => {
    if (!offen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape')         { e.preventDefault(); setOffen(false); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); setAuswahl(i => Math.min(flach.length - 1, i + 1)); }
      else if (e.key === 'ArrowUp')   { e.preventDefault(); setAuswahl(i => Math.max(0, i - 1)); }
      else if (e.key === 'Home')      { e.preventDefault(); setAuswahl(0); }
      else if (e.key === 'End')       { e.preventDefault(); setAuswahl(Math.max(0, flach.length - 1)); }
      else if (e.key === 'Enter')     { e.preventDefault(); const t = flach[auswahl]; if (t) ausfuehren(t); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [offen, flach, auswahl, ausfuehren]);

  // gewählten Eintrag im Blick halten
  useEffect(() => {
    const el = listeRef.current?.querySelector<HTMLElement>(`[data-idx="${auswahl}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [auswahl, flach]);

  if (!offen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] bg-[rgb(16_32_52/0.5)] px-4 pt-[10vh] pb-8 overflow-y-auto"
      onMouseDown={e => { if (e.target === e.currentTarget) setOffen(false); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Befehlspalette"
        className="card max-w-[640px] mx-auto overflow-hidden"
      >
        <div className="flex items-center gap-3 px-4 h-[52px] border-b border-line">
          <Search size={18} strokeWidth={1.75} className="text-ink-3 shrink-0" />
          <input
            ref={inputRef}
            value={q}
            onChange={e => { setQ(e.target.value); setAuswahl(0); }}
            placeholder="Seite, Aktion, Kunde, Rechnung oder Buchung …"
            aria-label="Suchen oder Befehl eingeben"
            className="flex-1 min-w-0 bg-transparent text-[15px] text-ink placeholder:text-ink-3 focus:outline-hidden"
            autoComplete="off"
            spellCheck={false}
          />
          {sucheLaeuft && <span className="font-mono text-[11px] text-ink-3">■ sucht …</span>}
          <button
            type="button"
            onClick={() => setOffen(false)}
            aria-label="Schließen"
            className="font-mono text-[10.5px] text-ink-3 border border-line-2 rounded-sm px-1.5 py-0.5 hover:bg-well hover:text-navy transition-colors"
          >
            ESC
          </button>
        </div>

        <div ref={listeRef} className="max-h-[60vh] overflow-y-auto py-2">
          {flach.length === 0 && (
            <p className="px-4 py-8 text-center text-[13.5px] text-ink-3">
              {sucheLaeuft ? 'Wird gesucht …' : `Nichts gefunden für „${q}“.`}
            </p>
          )}
          {gruppiert.map(({ g, items }) => (
            <div key={g} className="px-2 pb-1">
              <p className="label-mono px-2 pt-2 pb-1">{g}</p>
              {items.map(e => {
                const idx = flach.indexOf(e);
                const aktiv = idx === auswahl;
                const Icon = e.icon;
                return (
                  <button
                    key={e.id}
                    type="button"
                    data-idx={idx}
                    onMouseEnter={() => setAuswahl(idx)}
                    onClick={() => ausfuehren(e)}
                    className={`w-full flex items-center gap-3 px-2.5 py-2 rounded-md text-left transition-colors ${
                      aktiv ? 'bg-info-bg text-navy' : 'text-ink hover:bg-row'
                    }`}
                  >
                    <Icon size={16} strokeWidth={1.75} className={`shrink-0 ${aktiv ? 'text-navy' : 'text-ink-3'}`} />
                    <span className="flex-1 min-w-0 truncate text-[13.5px] font-medium">{e.label}</span>
                    {e.detail && (
                      <span className={`shrink-0 text-[11.5px] ${e.gruppe === 'Seiten' ? 'text-ink-3' : 'num text-ink-2'}`}>{e.detail}</span>
                    )}
                    {aktiv && <kbd className="font-mono text-[10.5px] text-ink-3 shrink-0">↵</kbd>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between gap-3 px-4 py-2 border-t border-line bg-row font-mono text-[10.5px] text-ink-3">
          <span>↑↓ wählen · ↵ öffnen · esc schließen</span>
          <span className="hidden sm:inline">Strg K öffnet von überall</span>
        </div>
      </div>
    </div>
  );
}
