'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  ClipboardList, Receipt, Wallet, Landmark, FileText, User, Truck,
  LayoutDashboard, Settings, Building2, Users, Upload, LogOut, X, Menu,
  CreditCard, CalendarCheck,
  type LucideIcon,
} from 'lucide-react';

type Props = {
  companyName: string;
  role: string;
};

type SubItem = { href: string; label: string };
type NavEntry =
  | { kind: 'link'; href: string; label: string; icon: LucideIcon }
  | { kind: 'group'; href: string; label: string; icon: LucideIcon; children: SubItem[] };

// IC&P Corporate Design – Grau/Blau
const NAV_BG     = '#3F454C'; // Grau dunkel
const NAV_ACCENT = '#4F90E8'; // Blau (aktive Elemente)

// Rechnungen, Belege (OCR) und Offene Posten sind seit dem Vollintegrations-
// Update fixer Bestandteil der Lösung und nicht mehr über modules_enabled
// zu- oder abschaltbar (siehe MandantDetail/ModulToggle).
function buildNav(role: string): NavEntry[] {
  // Die Überschrift ist selbst ein Menüpunkt und führt zur
  // Monatsübersicht (Design-Review August 2026) – die Auswertung, die
  // vorher im Dashboard steckte.
  const buchungenGroup: NavEntry = {
    kind: 'group',
    href: '/monatsuebersicht',
    label: 'EINNAHMEN & AUSGABEN',
    icon: ClipboardList,
    children: [
      { href: '/buchungen',            label: 'Buchungen' },
      { href: '/buchungen/kategorien', label: 'Kategorien' },
      { href: '/dauerauftraege',       label: 'Daueraufträge' },
      { href: '/belege',               label: 'Belege (OCR)' },
    ],
  };

  // Reihenfolge: Buchungen → UVA → Rechnungen → Kunden → Lieferanten →
  // Offene Posten → Bank-Import → Konten → Monatsabschluss (Rechnungen
  // bewusst vor Offenen Posten, Lieferanten unterhalb Kunden).
  const rest: NavEntry[] = [
    { kind: 'link', href: '/uva',             label: 'UVA-Meldung',    icon: Receipt },
    { kind: 'link', href: '/rechnungen',      label: 'Fakturieren',    icon: FileText },
    { kind: 'link', href: '/kunden',          label: 'Kunden',         icon: User },
    { kind: 'link', href: '/lieferanten',     label: 'Lieferanten',    icon: Truck },
    { kind: 'link', href: '/offene-posten',   label: 'Offene Posten',  icon: Wallet },
    { kind: 'link', href: '/import',          label: 'Bank-Import',    icon: Landmark },
    { kind: 'link', href: '/konten',          label: 'Konten',         icon: CreditCard },
    { kind: 'link', href: '/monatsabschluss', label: 'Monatsabschluss', icon: CalendarCheck },
  ];

  if (role === 'superadmin') {
    return [
      { kind: 'link', href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      buchungenGroup,
      ...rest,
      { kind: 'link', href: '/einstellungen', label: 'Einstellungen', icon: Settings },
    ];
  }

  if (role === 'klient') {
    return [buchungenGroup, ...rest];
  }

  return [];
}

const kanzleiItems: { href: string; label: string; icon: LucideIcon }[] = [
  { href: '/kanzlei',             label: 'Kanzlei-Übersicht', icon: Building2 },
  { href: '/kanzlei/benutzer',    label: 'Benutzer',           icon: Users },
  { href: '/kanzlei/bmd-export',  label: 'BMD-Export',         icon: Upload },
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

  const mainItems = buildNav(role);

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

      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {mainItems.map(item =>
          item.kind === 'group' ? (
            <div key={item.href}>
              <Link
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={`block pt-1 pb-1.5 px-2 group/gruppe`}
                title="Monatsübersicht öffnen"
              >
                <span className={`text-[10px] font-bold uppercase tracking-widest transition-colors ${
                  isActive(item.href) ? 'text-white' : 'text-white/40 group-hover/gruppe:text-white/70'
                }`}>
                  {item.label}
                </span>
              </Link>
              <div className="space-y-0.5">
                {item.children.map(child => (
                  <NavSubLink
                    key={child.href}
                    href={child.href}
                    label={child.label}
                    active={isActive(child.href)}
                    onClick={() => setMobileOpen(false)}
                  />
                ))}
              </div>
            </div>
          ) : (
            <NavLink
              key={item.href}
              href={item.href}
              label={item.label}
              icon={item.icon}
              active={isActive(item.href)}
              onClick={() => setMobileOpen(false)}
            />
          )
        )}

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
            &copy; ICP Solutions &middot; v0.9
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
      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
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

// Eingerückter Unterpunkt (z. B. Kategorien / Daueraufträge unter „Buchungen")
function NavSubLink({
  href, label, active, onClick,
}: {
  href: string; label: string; active: boolean; onClick: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`flex items-center gap-2.5 pl-[3.15rem] pr-3 py-2 rounded-lg text-[13px] transition-colors ${
        active
          ? 'bg-white/10 text-white font-medium'
          : 'text-white/55 hover:text-white/85 hover:bg-white/5'
      }`}
    >
      <span className="w-1 h-1 rounded-full bg-current opacity-70 flex-shrink-0" />
      <span>{label}</span>
    </Link>
  );
}
