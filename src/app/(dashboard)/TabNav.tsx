'use client';

// Horizontale Navigation unter der Navy-Kopfleiste (Welle 4b, nach dem
// HR-Suite-PoC): erste Zeile die Bereiche als Tabs mit Signal-Unterstrich,
// zweite Zeile die Seiten des aktiven Bereichs. Beide Zeilen scrollen auf
// schmalen Bildschirmen horizontal – kein Mobile-Menü mehr nötig.

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { buildNav, isActivePath } from './navigation';

export default function TabNav() {
  const pathname = usePathname();
  const gruppen = buildNav();

  const aktiveGruppe =
    gruppen.find(g => g.items.some(i => isActivePath(pathname, i.href)))
    ?? gruppen[0];

  return (
    <nav className="bg-card border-b border-line shrink-0 print:hidden" aria-label="Hauptnavigation">
      {/* Bereiche */}
      <div className="max-w-6xl mx-auto px-[10px] flex gap-0.5 overflow-x-auto [scrollbar-width:none]">
        {gruppen.map(g => {
          const aktiv = g.key === aktiveGruppe?.key;
          return (
            <Link
              key={g.key}
              href={g.items[0].href}
              aria-current={aktiv ? 'true' : undefined}
              className={`px-3.5 pt-[13px] pb-[10px] text-[14.5px] whitespace-nowrap border-b-[3px] transition-colors ${
                aktiv
                  ? 'text-navy font-semibold border-signal'
                  : 'text-ink-2 font-medium border-transparent hover:text-navy'
              }`}
            >
              {g.label}
            </Link>
          );
        })}
      </div>

      {/* Seiten des aktiven Bereichs */}
      {aktiveGruppe && (
        <div className="border-t border-line bg-bg/60">
          <div className="max-w-6xl mx-auto px-[14px] py-1.5 flex gap-1 overflow-x-auto [scrollbar-width:none]">
            {aktiveGruppe.items.map(item => {
              const aktiv = isActivePath(pathname, item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={aktiv ? 'page' : undefined}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-[5px] rounded-md text-[13px] whitespace-nowrap transition-colors ${
                    aktiv
                      ? 'bg-info-bg text-navy font-semibold'
                      : 'text-ink-2 hover:bg-well hover:text-navy'
                  }`}
                >
                  <Icon size={15} strokeWidth={1.75} className={aktiv ? 'text-navy' : 'text-ink-3'} />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </nav>
  );
}
