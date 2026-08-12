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
      <div>
        <h1 className="text-2xl font-bold text-brand flex items-center gap-2">
          {Icon && <Icon size={22} strokeWidth={1.75} className="text-accent-dark" />}
          {title}
        </h1>
        {subtitle && <p className="text-gray-500 text-sm">{subtitle}</p>}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  );
}
