// Einheitlicher Leerzustand MIT Ausweg (Design-Review Welle 3, Muster M2:
// kein Zustand ohne nächste Aktion). Icon + Erklärung + Handlungs-Knopf.
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';

export default function EmptyState({
  icon: Icon,
  text,
  hinweis,
  href,
  cta,
}: {
  icon?: LucideIcon;
  /** Kurze Feststellung, z. B. "Noch keine Kunden angelegt." */
  text: string;
  /** Optionale zweite Zeile mit Kontext */
  hinweis?: string;
  href: string;
  cta: string;
}) {
  return (
    <div className="card p-12 text-center">
      {Icon && <Icon size={28} strokeWidth={1.5} className="mx-auto text-ink-3 mb-3" />}
      <p className="text-ink text-sm font-medium">{text}</p>
      {hinweis && <p className="text-ink-3 text-[12.5px] mt-1">{hinweis}</p>}
      <Link
        href={href}
        className="inline-block mt-4 bg-navy text-white text-[13.5px] font-medium px-4 py-2 rounded-lg hover:bg-navy-2 transition-colors"
      >
        {cta}
      </Link>
    </div>
  );
}
