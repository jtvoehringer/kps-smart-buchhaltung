// Navigationsstruktur (Design-Review Welle 3, Gruppen) – von der
// Tab-Navigation (Welle 4b, horizontal wie im HR-Suite-PoC) genutzt.
import {
  ClipboardList, Wallet, Landmark, FileText, User, Truck,
  LayoutDashboard, Settings, Upload, BarChart3, Boxes,
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
    label: 'Konten & Anlagen',
    items: [
      { href: '/import',  label: 'Bank-Import',        icon: Landmark,   keywords: 'csv camt kontoauszug bank' },
      { href: '/konten',  label: 'Konten',             icon: CreditCard, keywords: 'bank kassa abstimmung' },
      { href: '/anlagen', label: 'Anlagenverzeichnis', icon: Boxes,      keywords: 'anlagen afa abschreibung anlagevermögen buchwert gwg' },
    ],
  },
  {
    key: 'abschluss',
    label: 'Abschluss & Meldungen',
    items: [
      { href: '/uva',             label: 'UVA-Meldung',     icon: Percent, keywords: 'umsatzsteuer voranmeldung finanzonline' },
      { href: '/monatsabschluss', label: 'Monatsabschluss', icon: CalendarCheck, keywords: 'sperren abschließen' },
      // Entscheidung 12.08.2026: der Klient stößt den Export zur Kanzlei an.
      { href: '/bmd-export',      label: 'Steuerberater-Export', icon: Upload, keywords: 'bmd ntcs export steuerberater kanzlei' },
    ],
  },
];

const SYSTEM: NavGroup = {
  key: 'system',
  label: 'System',
  items: [{ href: '/einstellungen', label: 'Einstellungen', icon: Settings, keywords: 'konfiguration profil' }],
};

// Entscheidung 08.09.2026: Die E&A Suite wird nur noch von einer Person
// genutzt (kein Kanzlei-Vertrieb). Rollen spielen in der Oberfläche keine
// Rolle mehr – wer angemeldet ist, sieht alles. Der Kanzlei-Bereich
// (Mandantenverwaltung, Benutzer) wurde entfernt.
export function buildNav(): NavGroup[] {
  return [...GRUPPEN, SYSTEM];
}

export function isActivePath(pathname: string, href: string) {
  if (href === '/dashboard') return pathname === '/dashboard';
  if (href === '/buchungen') return pathname === '/buchungen' || /^\/buchungen\/(neu|[^/]+\/bearbeiten)/.test(pathname);
  return pathname.startsWith(href);
}
