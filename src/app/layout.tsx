import type { Metadata, Viewport } from 'next';
import { Space_Grotesk, IBM_Plex_Mono } from 'next/font/google';

// ICP-CD: Space Grotesk für Headlines/UI, IBM Plex Mono für Labels,
// Beträge und alles Tabellarische (font-mono).
const schrift = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});
const monoschrift = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
  display: 'swap',
});
import './globals.css';
import RegisterSW from './RegisterSW';

export const metadata: Metadata = {
  title: 'Smart Buchhaltung',
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
    title: 'Smart Buchhaltung',
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
      <body className="bg-surface font-sans text-kontrast antialiased">
        <RegisterSW />
        {children}
      </body>
    </html>
  );
}
