import type { Metadata, Viewport } from 'next';
import './globals.css';
import RegisterSW from './RegisterSW';

export const metadata: Metadata = {
  title: 'KPS Smart Buchhaltung',
  description: 'Digitale Buchführung für österreichische EA-Rechner',
  manifest: '/manifest.json',
  icons: {
    icon: '/kps-logo.png',
    apple: '/icons/apple-touch-icon.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'KPS Buchhaltung',
  },
};

export const viewport: Viewport = {
  themeColor: '#35609E',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="de">
      <body className="bg-surface text-gray-900 antialiased">
        <RegisterSW />
        {children}
      </body>
    </html>
  );
}
