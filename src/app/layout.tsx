import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';

// ICP-CD: Space Grotesk für Headlines/UI, IBM Plex Mono für Labels,
// Beträge und alles Tabellarische (font-mono). Welle 4: die Schriften
// liegen im Projekt (aus den CD-Originalen) statt bei Google – keine
// Anfrage an Google-Server beim Seitenaufruf, kein Build-Download.
const schrift = localFont({
  src: [
    { path: './fonts/SpaceGrotesk-300_700-latin.woff2',     weight: '300 700', style: 'normal' },
    { path: './fonts/SpaceGrotesk-300_700-latin-ext.woff2', weight: '300 700', style: 'normal' },
  ],
  variable: '--font-space-grotesk',
  display: 'swap',
});
const monoschrift = localFont({
  src: [
    { path: './fonts/IBMPlexMono-400-latin.woff2',     weight: '400', style: 'normal' },
    { path: './fonts/IBMPlexMono-400-latin-ext.woff2', weight: '400', style: 'normal' },
    { path: './fonts/IBMPlexMono-500-latin.woff2',     weight: '500', style: 'normal' },
    { path: './fonts/IBMPlexMono-500-latin-ext.woff2', weight: '500', style: 'normal' },
    { path: './fonts/IBMPlexMono-600-latin.woff2',     weight: '600', style: 'normal' },
    { path: './fonts/IBMPlexMono-600-latin-ext.woff2', weight: '600', style: 'normal' },
  ],
  variable: '--font-plex-mono',
  display: 'swap',
});
import './globals.css';
import RegisterSW from './RegisterSW';

export const metadata: Metadata = {
  title: 'E&A Suite',
  description: 'Digitale Buchführung für österreichische EA-Rechner',
  manifest: '/manifest.json',
  icons: {
    // Produktzeichen (ICP-CD) als Favicon – das Kanzleilogo bleibt
    // Login-Seite und Sidebar-Kopf vorbehalten.
    icon: '/icons/icon-192.png',
    apple: '/icons/apple-touch-icon.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'E&A Suite',
  },
};

export const viewport: Viewport = {
  themeColor: '#14355C',
  width: 'device-width',
  initialScale: 1,
  // maximumScale entfernt (Design-Review): Zoom auf dem Handy bleibt möglich.
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="de" className={`${schrift.variable} ${monoschrift.variable}`}>
      <body className="bg-bg font-sans text-ink antialiased">
        <RegisterSW />
        {children}
      </body>
    </html>
  );
}
