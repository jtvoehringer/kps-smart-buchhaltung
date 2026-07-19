import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'KPS Smart Buchhaltung',
  description: 'Digitale Buchführung für österreichische EA-Rechner',
  icons: {
    icon: '/kps-logo.png',
    apple: '/kps-logo.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="de">
      <body className="bg-gray-50 text-gray-900 antialiased">
        {children}
      </body>
    </html>
  );
}
