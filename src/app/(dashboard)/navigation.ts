// Navigationsstruktur (Design-Review Welle 3, Gruppen) – von der
// Tab-Navigation (Welle 4b, horizontal wie im HR-Suite-PoC) genutzt.
import {
  ClipboardList, Wallet, Landmark, FileText, User, Truck,
  LayoutDashboard, Settings, Building2, Users, Upload, BarChart3,
  CreditCard, CalendarCheck, CalendarRange, Tags, Repeat, ScanLine, Percent,
  type LucideIcon,
} from 'lucide-react';

export type NavItem  = { href: string; label: string; icon: LucideIcon; /** Synonyme für die Befehlspalette */ keywords?: string };
export type NavGroup = { key: string; label: string; items: NavItem[] };

// Fünf Gruppen; jeder Eintrag ist ein vollwertiger Menüpunkt mit Icon –
// auch die Monatsübersicht (Wunsch vom 12.08.2026).
const GRUPPEN: NavGroup[] = [
  {
    key: 'ueberblick',
    label: 'Überblick',
    items: [
      { href: '/dashboard',        label: 'Dashboard',       icon: LayoutDashboard, keywords: 'start übersicht aufgaben' },
      { href: '/monatsuebersicht', label: 'Monatsübersicht', icon: CalendarRange, keywords: 'auswertung jahr verlauf' },
      { href: '/bericht',          label: 'Bericht',         icon: BarChart3, keywords: 'unternehmensbericht reporting vermögen anlagevermögen umlaufvermögen forderungen verbindlichkeiten kontostand liquidität erfolgsrechnung' },
    ],
  },
  {
    key: 'ea',
    label: 'Einnahmen & Ausgaben',
    items: [
      { href: '/buchungen',            label: 'Buchungen',      icon: ClipboardList, keywords: 'einnahmen ausgaben liste belege' },
      { href: '/buchungen/kategorien', label: 'Kategorien',     icon: Tags, keywords: 'konten kontenplan' },
      { href: '/dauerauftraege',       label: 'Daueraufträge',  icon: Repeat, keywords: 'wiederkehrend miete abo' },
      { href: '/belege',               label: 'Belege (OCR)',   icon: ScanLine, keywords: 'scan foto upload erkennung' },
    ],
  },
  {
    key: 'faktura',
    label: 'Fakturierung',
    items: [
      { href: '/rechnungen',    label: 'Fakturieren',   icon: FileText, keywords: 'rechnungen ausgangsrechnung rechnung schreiben' },
      { href: '/kunden',        label: 'Kunden',        icon: User, keywords: 'debitoren' },
      { href: '/lieferanten',   label: 'Lieferanten',   icon: Truck, keywords: 'kreditoren' },
      { href: '/offene-posten', label: 'Offene Posten', icon: Wallet, keywords: 'überfällig eingangsrechnung zahlung mahnung' },
    ],
  },
  {
    key: 'bank',
    label: 'Bank & Konten',
    items: [
      { href: '/import', label: 'Bank-Import', icon: Landmark, keywords: 'csv camt kontoauszug' },
      { href: '/konten', label: 'Konten',      icon: CreditCard, keywords: 'bank kassa abstimmung' },
    ],
  },
  {
    key: 'abschluss',
    label: 'Abschluss & Meldungen',
    items: [
      { href: '/uva',             label: 'UVA-Meldung',     icon: Percent, keywords: 'umsatzsteuer voranmeldung finanzonline' },
      { href: '/monatsabschluss', label: 'Monatsabschluss', icon: CalendarCheck, keywords: 'sperren abschließen' },
      // Entscheidung 12.08.2026: der Klient stößt den Export zur Kanzlei an.
      { href: '/bmd-export',      label: 'BMD-Export',      icon: Upload, keywords: 'kanzlei steuerberater export' },
    ],
  },
];

const KANZLEI: NavGroup = {
  key: 'kanzlei',
  label: 'Kanzlei',
  items: [
    { href: '/kanzlei',          label: 'Kanzlei-Übersicht', icon: Building2 },
    { href: '/kanzlei/benutzer', label: 'Benutzer',           icon: Users },
  ],
};

const SYSTEM: NavGroup = {
  key: 'system',
  label: 'System',
  items: [{ href: '/einstellungen', label: 'Einstellungen', icon: Settings, keywords: 'konfiguration profil' }],
};

export function buildNav(role: string): NavGroup[] {
  if (role === 'superadmin') return [...GRUPPEN, KANZLEI, SYSTEM];
  if (role === 'klient')     return GRUPPEN;
  // Kanzlei/Admin bleiben bewusst auf ihren Bereich beschränkt
  // (Entscheidung 2 vom 12.08.2026).
  return [KANZLEI];
}

export function isActivePath(pathname: string, href: string) {
  if (href === '/dashboard') return pathname === '/dashboard';
  if (href === '/buchungen') return pathname === '/buchungen' || /^\/buchungen\/(neu|[^/]+\/bearbeiten)/.test(pathname);
  if (href === '/kanzlei')   return pathname === '/kanzlei' || pathname.startsWith('/kanzlei/mandant');
  return pathname.startsWith(href);
}

export function roleLabelFor(role: string) {
  return role === 'superadmin' ? 'Superadmin'
       : role === 'admin'      ? 'Administrator'
       : role === 'kanzlei'    ? 'Kanzlei'
       : 'Klient';
}
