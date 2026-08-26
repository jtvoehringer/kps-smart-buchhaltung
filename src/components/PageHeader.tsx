// Einheitliche Seiten-Kopfzeile (Design-Review Welle 3).
// Titel + optionales Icon links, Aktionen (Knöpfe, Zeitraumwähler) rechts –
// damit jede Seite denselben Aufbau hat statt eigener Varianten.
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export default function PageHeader({
  title,
  subtitle,
  icon: Icon,
  children,
}: {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  /** Rechte Seite: Aktions-Knöpfe, Zeitraumwähler … */
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold text-navy tracking-[-0.01em] flex items-center gap-2">
          {Icon && <Icon size={22} strokeWidth={1.75} className="text-ink-3 shrink-0" />}
          {title}
        </h1>
        {subtitle && <p className="text-ink-2 text-[14.5px] mt-1 max-w-[70ch]">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}
