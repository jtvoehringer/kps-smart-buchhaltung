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
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center">
      {Icon && <Icon size={28} strokeWidth={1.5} className="mx-auto text-gray-300 mb-3" />}
      <p className="text-gray-600 text-sm font-medium">{text}</p>
      {hinweis && <p className="text-gray-400 text-xs mt-1">{hinweis}</p>}
      <Link
        href={href}
        className="inline-block mt-4 bg-brand text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-accent transition-colors"
      >
        {cta}
      </Link>
    </div>
  );
}
