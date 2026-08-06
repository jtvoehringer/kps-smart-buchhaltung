'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  ClipboardList, Plus, Tags, Landmark, Receipt, RefreshCw,
  FileText, User, ScanSearch, LayoutDashboard, Settings,
  Building2, Users, Upload, LogOut, X, Menu,
  type LucideIcon,
} from 'lucide-react';

type Props = {
  companyName: string;
  role: string;
  modulesEnabled: string[];
};

type NavItem = { href: string; label: string; icon: LucideIcon };

// Basis-Items für Klienten (immer sichtbar)
const klientBaseItems: NavItem[] = [
  { href: '/buchungen',      label: 'Buchungsübersicht', icon: ClipboardList },
  { href: '/buchungen/neu',  label: 'Buchung erfassen',  icon: Plus },
  { href: '/buchungen/kategorien', label: 'Kategorien',  icon: Tags },
  { href: '/import',         label: 'Bank-Import',       icon: Landmark },
  { href: '/uva',            label: 'UVA',               icon: Receipt },
  { href: '/dauerauftraege', label: 'Daueraufträge',     icon: RefreshCw },
];

// Nur sichtbar wenn Modul 'invoicing' aktiv
const invoicingItems: NavItem[] = [
  { href: '/rechnungen',     label: 'Rechnungen',        icon: FileText },
  { href: '/kunden',         label: 'Kunden',            icon: User },
];

// Nur sichtbar wenn Modul 'ocr' aktiv
const ocrItems: NavItem[] = [
  { href: '/belege',         label: 'Belege (OCR)',      icon: ScanSearch },
];

// Superadmin-Basis (immer sichtbar)
const superadminBaseItems: NavItem[] = [
  { href: '/dashboard',      label: 'Dashboard',         icon: LayoutDashboard },
  { href: '/buchungen',      label: 'Buchungsübersicht', icon: ClipboardList },
  { href: '/buchungen/neu',  label: 'Buchung erfassen',  icon: Plus },
  { href: '/buchungen/kategorien', label: 'Kategorien',  icon: Tags },
  { href: '/import',         label: 'Bank-Import',       icon: Landmark },
  { href: '/uva',            label: 'UVA',               icon: Receipt },
  { href: '/dauerauftraege', label: 'Daueraufträge',     icon: RefreshCw },
];

const superadminTailItems: NavItem[] = [
  { href: '/einstellungen',  label: 'Einstellungen',     icon: Settings },
];

const kanzleiItems: NavItem[] = [
  { href: '/kanzlei',             label: 'Kanzlei-Übersicht', icon: Building2 },
  { href: '/kanzlei/benutzer',    label: 'Benutzer',           icon: Users },
  { href: '/kanzlei/bmd-export',  label: 'BMD-Export',         icon: Upload },
];

// IC&P Corporate Design – Grau/Blau
const NAV_BG     = '#3F454C'; // Grau dunkel
const NAV_ACCENT = '#4F90E8'; // Blau (aktive Elemente)

export default function Sidebar({ companyName, role, modulesEnabled }: Props) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const hasInvoicing = modulesEnabled.includes('invoicing');
  const hasOcr       = modulesEnabled.includes('ocr');

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

  // Nav-Items je Rolle zusammenbauen
  const mainItems = role === 'superadmin'
    ? [
        ...superadminBaseItems,
        ...(hasInvoicing ? invoicingItems : []),
        ...(hasOcr       ? ocrItems       : []),
        ...superadminTailItems,
      ]
    : role === 'klient'
    ? [
        ...klientBaseItems,
        ...(hasInvoicing ? invoicingItems : []),
        ...(hasOcr       ? ocrItems       : []),
      ]
    : [];

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
        {/* Klient- und Superadmin-Items */}
        {mainItems.map(item => (
          <NavLink
            key={item.href}
            {...item}
            active={isActive(item.href)}
            onClick={() => setMobileOpen(false)}
          />
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
            alt="IC&P Consultants"
            width={22}
            height={22}
            className="rounded-full opacity-80"
          />
          <p className="text-[9px] text-white/40">
            &copy; IC&amp;P Consultants e.U. &middot; v0.9
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
