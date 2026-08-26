'use client';

// Einheitlicher Zeitraumwähler (Design-Review Welle 3): ‹ Wert ›
// Für Jahre (Monatsübersicht, UVA) – bewusst generisch über eine
// sortierte Werteliste, damit auch Perioden ("Q2 2026") funktionieren.

export default function ZeitraumWaehler<T extends string | number>({
  werte,
  wert,
  onChange,
  breite = 'w-16',
}: {
  /** Verfügbare Werte, NEUESTER zuerst (absteigend sortiert) */
  werte: T[];
  wert: T;
  onChange: (neu: T) => void;
  /** Tailwind-Breitenklasse für die Anzeige (Standard: w-16 für Jahre) */
  breite?: string;
}) {
  const idx = werte.indexOf(wert);
  const aelter = werte[idx + 1];
  const neuer  = werte[idx - 1];

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => aelter !== undefined && onChange(aelter)}
        disabled={aelter === undefined}
        aria-label="Früherer Zeitraum"
        className="w-8 h-8 rounded-md border border-line-2 bg-card text-ink-2 hover:bg-row hover:text-navy disabled:opacity-30 transition-colors"
      >‹</button>
      <span className={`num font-semibold text-navy text-[17px] text-center ${breite}`}>{wert}</span>
      <button
        type="button"
        onClick={() => neuer !== undefined && onChange(neuer)}
        disabled={neuer === undefined}
        aria-label="Späterer Zeitraum"
        className="w-8 h-8 rounded-md border border-line-2 bg-card text-ink-2 hover:bg-row hover:text-navy disabled:opacity-30 transition-colors"
      >›</button>
    </div>
  );
}
