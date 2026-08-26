'use client';

// Helle Navigation (Design-Review Welle 4): weiße Fläche mit 1-px-Rand,
// Gruppen-Beschriftungen in Mono-Versalien, aktiver Punkt mit
// Signal-Balken links und Navy-Text. Die dunkle Fläche sitzt jetzt
// ausschließlich in der Kopfleiste (Topbar).

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  ClipboardList, Wallet, Landmark, FileText, User, Truck,
  LayoutDashboard, Settings, Building2, Users, Upload, LogOut,
  CreditCard, CalendarCheck, CalendarRange, Tags, Repeat, ScanLine, Percent,
  type LucideIcon,
} from 'lucide-react';

type NavItem  = { href: string; label: string; icon: LucideIcon };
type NavGroup = { label: string; items: NavItem[] };

// Navigation in 5 Gruppen (Design-Review Welle 3). Gruppen-Überschriften
// sind reine Beschriftungen; jeder Eintrag darunter ist ein vollwertiger
// Menüpunkt mit Icon – auch die Monatsübersicht (Wunsch vom 12.08.2026:
// gleiche Darstellung wie z. B. "UVA-Meldung" statt kleiner Überschrift).
function buildNav(role: string): NavGroup[] {
  const gruppen: NavGroup[] = [
    {
      label: 'Überblick',
      items: [
        { href: '/dashboard',        label: 'Dashboard',       icon: LayoutDashboard },
        { href: '/monatsuebersicht', label: 'Monatsübersicht', icon: CalendarRange },
      ],
    },
    {
      label: 'Einnahmen & Ausgaben',
      items: [
        { href: '/buchungen',            label: 'Buchungen',      icon: ClipboardList },
        { href: '/buchungen/kategorien', label: 'Kategorien',     icon: Tags },
        { href: '/dauerauftraege',       label: 'Daueraufträge',  icon: Repeat },
        { href: '/belege',               label: 'Belege (OCR)',   icon: ScanLine },
      ],
    },
    {
      label: 'Fakturierung',
      items: [
        { href: '/rechnungen',    label: 'Fakturieren',   icon: FileText },
        { href: '/kunden',        label: 'Kunden',        icon: User },
        { href: '/lieferanten',   label: 'Lieferanten',   icon: Truck },
        { href: '/offene-posten', label: 'Offene Posten', icon: Wallet },
      ],
    },
    {
      label: 'Bank & Konten',
      items: [
        { href: '/import', label: 'Bank-Import', icon: Landmark },
        { href: '/konten', label: 'Konten',      icon: CreditCard },
      ],
    },
    {
      label: 'Abschluss & Meldungen',
      items: [
        { href: '/uva',             label: 'UVA-Meldung',     icon: Percent },
        { href: '/monatsabschluss', label: 'Monatsabschluss', icon: CalendarCheck },
        // Entscheidung 12.08.2026: der Klient stößt den Export zur Kanzlei an.
        { href: '/bmd-export',      label: 'BMD-Export',      icon: Upload },
      ],
    },
  ];

  if (role === 'superadmin') {
    return [
      ...gruppen,
      { label: 'System', items: [{ href: '/einstellungen', label: 'Einstellungen', icon: Settings }] },
    ];
  }

  if (role === 'klient') {
    return gruppen;
  }

  // Kanzlei/Admin bleiben bewusst auf ihren Bereich beschränkt
  // (Entscheidung 2 vom 12.08.2026) – der Kanzlei-Block folgt unten.
  return [];
}

const kanzleiItems: NavItem[] = [
  { href: '/kanzlei',          label: 'Kanzlei-Übersicht', icon: Building2 },
  { href: '/kanzlei/benutzer', label: 'Benutzer',           icon: Users },
];

export function roleLabelFor(role: string) {
  return role === 'superadmin' ? 'Superadmin'
       : role === 'admin'      ? 'Administrator'
       : role === 'kanzlei'    ? 'Kanzlei'
       : 'Klient';
}

export default function Sidebar({
  companyName,
  role,
  onNavigate,
}: {
  companyName: string;
  role: string;
  /** Wird nach jedem Klick aufgerufen (schließt das Mobile-Menü) */
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === '/dashboard') return pathname === '/dashboard';
    if (href === '/buchungen') return pathname === '/buchungen';
    if (href === '/kanzlei')   return pathname === '/kanzlei';
    return pathname.startsWith(href);
  }

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = '/login';
  }

  const gruppen = buildNav(role);
  const zeigeKanzlei = ['admin', 'kanzlei', 'superadmin'].includes(role);

  return (
    <div className="flex flex-col h-full bg-card">
      {/* Mandant – auf dem Handy die einzige Stelle, an der er steht */}
      <div className="px-4 pt-4 pb-3 border-b border-line">
        <p className="label-mono">Mandant</p>
        <p className="mt-0.5 text-[13.5px] font-semibold text-navy truncate" title={companyName}>{companyName}</p>
      </div>

      <nav className="flex-1 px-2.5 py-3 overflow-y-auto">
        {gruppen.map((gruppe, i) => (
          <div key={gruppe.label} className={i > 0 ? 'mt-4' : ''}>
            <p className="label-mono px-2.5 pb-1.5">{gruppe.label}</p>
            <div className="space-y-px">
              {gruppe.items.map(item => (
                <NavLink key={item.href} {...item} active={isActive(item.href)} onClick={onNavigate} />
              ))}
            </div>
          </div>
        ))}

        {zeigeKanzlei && (
          <div className={gruppen.length > 0 ? 'mt-4' : ''}>
            <p className="label-mono px-2.5 pb-1.5">Kanzlei</p>
            <div className="space-y-px">
              {kanzleiItems.map(item => (
                <NavLink key={item.href} {...item} active={isActive(item.href)} onClick={onNavigate} />
              ))}
            </div>
          </div>
        )}
      </nav>

      <div className="px-2.5 py-3 border-t border-line">
        <button
          type="button"
          onClick={handleLogout}
          className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13.5px] text-ink-2 hover:bg-row hover:text-navy transition-colors"
        >
          <LogOut size={16} strokeWidth={1.75} className="shrink-0" />
          <span>Abmelden</span>
        </button>
        <div className="mt-2 px-2.5 flex items-center gap-2">
          <Image src="/icp-logo.png" alt="" width={18} height={18} className="rounded-[4px] opacity-90" />
          <p className="font-mono text-[10px] text-ink-3 truncate">
            © ICP Solutions
          </p>
        </div>
      </div>
    </div>
  );
}

function NavLink({
  href, label, icon: Icon, active, onClick,
}: NavItem & { active: boolean; onClick?: () => void }) {
  return (
    <Link
      href={href}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`relative flex items-center gap-2.5 pl-3 pr-2.5 py-[7px] rounded-md text-[13.5px] transition-colors ${
        active
          ? 'bg-info-bg text-navy font-semibold'
          : 'text-ink-2 hover:bg-row hover:text-navy'
      }`}
    >
      {active && <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-sm bg-signal" aria-hidden />}
      <Icon size={17} strokeWidth={1.75} className={`shrink-0 ${active ? 'text-navy' : 'text-ink-3'}`} />
      <span className="flex-1 truncate">{label}</span>
    </Link>
  );
}
