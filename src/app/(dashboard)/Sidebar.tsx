'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  ClipboardList, Receipt, Wallet, Landmark, FileText, User, Truck,
  LayoutDashboard, Settings, Building2, Users, Upload, LogOut, X, Menu,
  CreditCard, CalendarCheck, CalendarRange, Tags, Repeat, ScanLine, Percent,
  type LucideIcon,
} from 'lucide-react';

type Props = {
  companyName: string;
  role: string;
};

type NavItem  = { href: string; label: string; icon: LucideIcon };
type NavGroup = { label: string; items: NavItem[] };

// IC&P Corporate Design – Grau/Blau
const NAV_BG     = '#0E2540'; // Navy dunkel (ICP-CD, Welle 2)
const NAV_ACCENT = '#4F90E8'; // Blau (aktive Elemente)

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

const kanzleiItems: { href: string; label: string; icon: LucideIcon }[] = [
  { href: '/kanzlei',             label: 'Kanzlei-Übersicht', icon: Building2 },
  { href: '/kanzlei/benutzer',    label: 'Benutzer',           icon: Users },
];

export default function Sidebar({ companyName, role }: Props) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

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

  const roleLabel =
    role === 'superadmin' ? 'Superadmin'    :
    role === 'admin'      ? 'Administrator' :
    role === 'kanzlei'    ? 'Kanzlei'       :
    'Klient';

  const gruppen = buildNav(role);

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-5 pb-4 border-b border-white/10 flex-shrink-0">
        <Link href="/dashboard" className="flex flex-col items-start gap-2 group" onClick={() => setMobileOpen(false)}>
          <Image
            src="/kps-logo.png"
            alt="KPS Logo"
            width={120}
            height={58}
            className="transition-opacity group-hover:opacity-80 bg-white rounded-md px-2 py-1"
            priority
          />
          <span
            className="text-[11px] font-black tracking-[0.18em] uppercase leading-none transition-opacity group-hover:opacity-70 text-white/90"
          >
            SMART BUCHHALTUNG
          </span>
        </Link>
      </div>

      <nav className="flex-1 px-3 py-3 overflow-y-auto">
        {gruppen.map((gruppe, i) => (
          <div key={gruppe.label} className={i > 0 ? 'mt-3' : ''}>
            <div className="pb-1.5 px-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">
                {gruppe.label}
              </span>
            </div>
            <div className="space-y-0.5">
              {gruppe.items.map(item => (
                <NavLink
                  key={item.href}
                  href={item.href}
                  label={item.label}
                  icon={item.icon}
                  active={isActive(item.href)}
                  onClick={() => setMobileOpen(false)}
                />
              ))}
            </div>
          </div>
        ))}

        {/* Kanzlei-Bereich (admin, kanzlei, superadmin) */}
        {['admin', 'kanzlei', 'superadmin'].includes(role) && (
          <>
            <div className="pt-4 pb-1.5 px-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">
                Kanzlei
              </span>
            </div>
            {kanzleiItems.map(item => (
              <NavLink
                key={item.href}
                {...item}
                active={isActive(item.href)}
                onClick={() => setMobileOpen(false)}
              />
            ))}
          </>
        )}
      </nav>

      <div className="px-3 py-4 border-t border-white/10 flex-shrink-0">
        <div className="px-3 py-1 mb-2">
          <p className="text-[10px] uppercase tracking-widest font-bold text-white/40">
            {roleLabel}
          </p>
        </div>
        <button
          onClick={handleLogout}
          className="w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-2.5 hover:bg-white/10 text-white/70"
        >
          <LogOut size={16} strokeWidth={1.75} className="flex-shrink-0" />
          <span>Abmelden</span>
        </button>
        <div className="mt-3 px-3 flex items-center gap-2">
          <Image
            src="/icp-logo.png"
            alt="ICP Solutions"
            width={22}
            height={22}
            className="rounded-full opacity-80"
          />
          <p className="text-[9px] text-white/40">
            {/* Release aus package.json, Build = Git-Commit des Vercel-Builds
                (next.config.js) – hilft im Support, den Stand zu erkennen. */}
            &copy; ICP Solutions &middot; Rel. {process.env.NEXT_PUBLIC_APP_VERSION ?? '0.9'}
            {process.env.NEXT_PUBLIC_BUILD_SHA ? ` – ${process.env.NEXT_PUBLIC_BUILD_SHA}` : ''}
          </p>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <aside
        style={{ backgroundColor: NAV_BG }}
        className="hidden md:flex flex-col w-56 flex-shrink-0 h-full text-white"
      >
        <SidebarContent />
      </aside>

      <button
        onClick={() => setMobileOpen(o => !o)}
        style={{ backgroundColor: NAV_BG, color: '#ffffff' }}
        className="md:hidden fixed top-3 left-3 z-40 flex items-center justify-center w-9 h-9 rounded-lg shadow-lg"
      >
        {mobileOpen ? <X size={18} strokeWidth={2} /> : <Menu size={18} strokeWidth={2} />}
      </button>

      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-30 md:hidden"
            onClick={() => setMobileOpen(false)}
          />
          <aside
            style={{ backgroundColor: NAV_BG }}
            className="fixed top-0 left-0 z-40 w-56 h-full flex flex-col text-white shadow-2xl md:hidden"
          >
            <SidebarContent />
          </aside>
        </>
      )}
    </>
  );
}

function NavLink({
  href, label, icon: Icon, active, onClick,
}: {
  href: string; label: string; icon: LucideIcon; active: boolean; onClick: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      style={active
        ? { backgroundColor: NAV_ACCENT, color: '#ffffff' }
        : { color: 'rgba(255,255,255,0.75)' }
      }
      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${
        active
          ? 'font-semibold'
          : 'hover:bg-white/10'
      }`}
    >
      <Icon size={18} strokeWidth={1.75} className="flex-shrink-0" />
      <span className="flex-1">{label}</span>
    </Link>
  );
}
