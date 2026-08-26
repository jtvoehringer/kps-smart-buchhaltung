// ============================================================
// Basis-Bausteine im ICP-CD (Design-Review Welle 4)
//
// Vorbild ist die Darstellung des HR-Suite-PoC: flache weiße Karten
// mit 1-px-Rand, keine Schatten, Zahlen und Labels in IBM Plex Mono,
// Status als kleine Mono-Badges auf heller Tonfläche. Die Bausteine
// sind bewusst klein gehalten – jede Seite soll dieselben Formen
// bekommen, ohne 20 Utility-Klassen je Stelle.
// ============================================================
import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/utils';

/* ---------- Card ------------------------------------------------ */

export function Card({
  className,
  padded = true,
  ...rest
}: ComponentProps<'div'> & { /** Innenabstand 20 px (Standard) oder keiner (für Tabellen) */ padded?: boolean }) {
  return (
    <div
      className={cn('card', padded ? 'p-5' : 'overflow-hidden', className)}
      {...rest}
    />
  );
}

/** Kartenkopf mit Titel links und optionalen Aktionen rechts */
export function CardHeader({
  title,
  children,
  className,
  border = false,
}: {
  title: ReactNode;
  children?: ReactNode;
  className?: string;
  /** Trennlinie darunter – für Karten ohne Innenabstand (Tabellen) */
  border?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-3',
        border ? 'px-5 py-3.5 border-b border-line' : 'mb-3',
        className,
      )}
    >
      <h2 className="text-[17px] font-semibold text-navy leading-snug">{title}</h2>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  );
}

/* ---------- Tile (Kennzahl) ------------------------------------- */

export function Tile({
  label,
  value,
  detail,
  href,
  tone = 'navy',
  className,
}: {
  label: ReactNode;
  /** Kennzahl – wird in Mono gesetzt */
  value: ReactNode;
  /** Zeile unter der Zahl (Bezug, Vormonat, Hinweis) */
  detail?: ReactNode;
  /** Verlinkt die ganze Kachel */
  href?: string;
  tone?: 'navy' | 'ink' | 'good' | 'warn' | 'crit';
  className?: string;
}) {
  const farbe = {
    navy: 'text-navy',
    ink:  'text-ink-2',
    good: 'text-good',
    warn: 'text-warn',
    crit: 'text-crit',
  }[tone];

  const inhalt = (
    <>
      <div className="text-[12.5px] font-medium text-ink-2 tracking-[0.02em]">{label}</div>
      <div className={cn('num text-[24px] sm:text-[28px] font-semibold leading-[1.15] mt-1.5 break-words', farbe)}>{value}</div>
      {detail && <div className="text-[12.5px] text-ink-3 mt-1">{detail}</div>}
    </>
  );

  const basis = cn('card px-[18px] py-4 block', className);
  return href
    ? <Link href={href} className={cn(basis, 'transition-colors hover:border-signal')}>{inhalt}</Link>
    : <div className={basis}>{inhalt}</div>;
}

/* ---------- Badge ------------------------------------------------ */

export type BadgeTone = 'good' | 'warn' | 'crit' | 'info' | 'gray' | 'navy';

const BADGE_TONE: Record<BadgeTone, string> = {
  good: 'bg-good-bg text-good',
  warn: 'bg-warn-bg text-warn',
  crit: 'bg-crit-bg text-crit',
  info: 'bg-info-bg text-info',
  gray: 'bg-well text-ink-2',
  navy: 'bg-navy text-white',
};

/** Status-Badge: Mono, Versalien, 11 px, helle Tonfläche */
export function Badge({
  tone = 'gray',
  className,
  children,
  ...rest
}: ComponentProps<'span'> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 font-mono text-[11px] font-semibold tracking-[0.03em] uppercase rounded-sm px-2 py-0.5 whitespace-nowrap',
        BADGE_TONE[tone],
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  );
}

/** Herkunfts-Chip: woher kommt ein Wert (Bank-Import, OCR, Kanzlei) */
export function SrcChip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 font-mono text-[10.5px] text-ink-3 border border-dashed border-line-2 rounded-sm px-[7px] py-0.5 whitespace-nowrap',
        className,
      )}
    >
      <i className="w-1.5 h-1.5 rounded-full bg-signal shrink-0" aria-hidden />
      {children}
    </span>
  );
}

/* ---------- Note (Hinweiskasten) -------------------------------- */

export function Note({
  tone = 'info',
  className,
  children,
}: {
  tone?: 'info' | 'warn' | 'crit' | 'good';
  className?: string;
  children: ReactNode;
}) {
  const t = {
    info: 'bg-info-bg border-info-line text-[#1c4b66]',
    warn: 'bg-warn-bg border-amber-200 text-amber-900',
    crit: 'bg-crit-bg border-red-200 text-red-800',
    good: 'bg-good-bg border-green-200 text-green-800',
  }[tone];
  return (
    <div className={cn('border rounded-lg px-4 py-3 text-[13px] leading-relaxed', t, className)}>
      {children}
    </div>
  );
}

/* ---------- Button ------------------------------------------------ */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md';

const BTN_VARIANT: Record<ButtonVariant, string> = {
  primary:   'bg-navy border-navy text-white hover:bg-navy-2',
  secondary: 'bg-card border-navy text-navy hover:bg-info-bg',
  ghost:     'bg-card border-line-2 text-ink-2 hover:bg-row',
  danger:    'bg-card border-line-2 text-ink-2 hover:text-crit hover:border-red-200 hover:bg-crit-bg',
};
const BTN_SIZE: Record<ButtonSize, string> = {
  sm: 'px-[11px] py-[5px] text-[12.5px] rounded-md',
  md: 'px-4 py-2 text-[13.5px] rounded-lg',
};

export function buttonClass(variant: ButtonVariant = 'primary', size: ButtonSize = 'md', className?: string) {
  return cn(
    'inline-flex items-center justify-center gap-1.5 border font-medium whitespace-nowrap transition-colors',
    'disabled:opacity-40 disabled:pointer-events-none',
    BTN_VARIANT[variant],
    BTN_SIZE[size],
    className,
  );
}

/** Knopf – mit href als Link, sonst als <button type="button"> */
export function Button({
  href,
  variant = 'primary',
  size = 'md',
  className,
  children,
  type = 'button',
  ...rest
}: Omit<ComponentProps<'button'>, 'className' | 'children'> & {
  href?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: ReactNode;
}) {
  const klasse = buttonClass(variant, size, className);
  if (href !== undefined) {
    return (
      <Link href={href} className={klasse} onClick={rest.onClick as unknown as ComponentProps<typeof Link>['onClick']} title={rest.title}>
        {children}
      </Link>
    );
  }
  return <button type={type} className={klasse} {...rest}>{children}</button>;
}

/* ---------- Tabelle ------------------------------------------------ */

/** Spaltenkopf: Mono-Versalien, 11 px, gesperrt */
export function Th({ className, num, ...rest }: ComponentProps<'th'> & { /** rechtsbündige Zahlenspalte */ num?: boolean }) {
  return (
    <th
      className={cn(
        'label-mono text-left px-3 py-2.5 border-b border-line-2 font-semibold whitespace-nowrap',
        num && 'text-right',
        className,
      )}
      {...rest}
    />
  );
}

/** Zelle; num = Zahl in Mono rechtsbündig */
export function Td({ className, num, ...rest }: ComponentProps<'td'> & { num?: boolean }) {
  return (
    <td
      className={cn('px-3 py-2.5 border-b border-line align-middle', num && 'num text-right text-[13px]', className)}
      {...rest}
    />
  );
}

/** Tabellenzeile mit Hover; letzte Zeile ohne Unterlinie */
export function Tr({ className, ...rest }: ComponentProps<'tr'>) {
  return <tr className={cn('hover:bg-row last:[&>td]:border-b-0', className)} {...rest} />;
}

/* ---------- Key-Value ----------------------------------------------- */

/** Zweispaltiges Schlüssel-Wert-Raster wie im PoC (Vergütungsmodell) */
export function Kv({ rows, className }: { rows: { k: ReactNode; v: ReactNode; mono?: boolean }[]; className?: string }) {
  return (
    <div className={cn('grid grid-cols-[minmax(140px,38%)_1fr] text-[13.5px]', className)}>
      {rows.map((r, i) => {
        const letzte = i === rows.length - 1;
        return (
          <div key={i} className="contents">
            <div className={cn('py-[7px] pr-2 text-ink-2', !letzte && 'border-b border-line')}>{r.k}</div>
            <div className={cn('py-[7px] font-medium text-ink', r.mono && 'num text-[12.5px] font-semibold', !letzte && 'border-b border-line')}>{r.v}</div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- Balkendiagramm (HTML, direkte Beschriftung) ------------- */

export function BarChart({
  rows,
  max,
  format = v => String(v),
  className,
}: {
  rows: { label: ReactNode; value: number; /** zweiter Balken (z. B. Ausgaben) */ value2?: number; warn?: boolean; href?: string }[];
  /** Skalenende; Standard: größter Wert × 1,1 */
  max?: number;
  format?: (v: number) => string;
  className?: string;
}) {
  const m = max ?? Math.max(1, ...rows.flatMap(r => [r.value, r.value2 ?? 0])) * 1.1;
  return (
    <div className={cn('mt-1.5', className)}>
      {rows.map((r, i) => {
        const inhalt = (
          <>
            <span className="text-[12.5px] text-ink-2 truncate">{r.label}</span>
            <div className="space-y-0.5">
              <div className={cn('h-3.5 rounded-r-sm min-w-[2px]', r.warn ? 'bg-warn-bar' : 'bg-chart-1')} style={{ width: `${Math.min(100, r.value / m * 100)}%` }} />
              {r.value2 !== undefined && (
                <div className="h-3.5 rounded-r-sm min-w-[2px] bg-chart-2" style={{ width: `${Math.min(100, r.value2 / m * 100)}%` }} />
              )}
            </div>
            <span className="num text-[12px] font-semibold text-ink text-right leading-tight">
              {format(r.value)}
              {r.value2 !== undefined && <span className="block text-ink-2 font-medium">{format(r.value2)}</span>}
            </span>
          </>
        );
        const klasse = 'grid grid-cols-[88px_1fr_96px] items-center gap-2.5 py-[5px]';
        return r.href
          ? <Link key={i} href={r.href} className={cn(klasse, 'rounded-sm hover:bg-row -mx-1 px-1')}>{inhalt}</Link>
          : <div key={i} className={klasse}>{inhalt}</div>;
      })}
    </div>
  );
}

/** Legende zu einem Diagramm */
export function Legend({ items, className }: { items: { color: string; label: ReactNode }[]; className?: string }) {
  return (
    <div className={cn('flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-ink-2', className)}>
      {items.map((it, i) => (
        <span key={i} className="inline-flex items-center gap-1.5">
          <i className={cn('inline-block w-2.5 h-2.5 rounded-[3px]', it.color)} aria-hidden />
          {it.label}
        </span>
      ))}
    </div>
  );
}

/* ---------- Fortschritt ---------------------------------------------- */

export function Progress({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cn('h-2 rounded-sm bg-line overflow-hidden', className)}>
      <div className="h-full rounded-sm bg-good transition-[width] duration-300" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}
