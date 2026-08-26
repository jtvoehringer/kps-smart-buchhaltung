'use client';

// Rahmen aller Dashboard-Seiten (Design-Review Welle 4b):
// Navy-Kopfleiste, darunter die horizontale Tab-Navigation wie im
// HR-Suite-PoC, darunter der scrollende Inhalt. Keine Sidebar mehr.

import Topbar from './Topbar';
import TabNav from './TabNav';
import { roleLabelFor } from './navigation';

export default function AppShell({
  companyName,
  role,
  children,
}: {
  companyName: string;
  role: string;
  children: React.ReactNode;
}) {
  return (
    <div className="h-screen flex flex-col overflow-hidden bg-bg">
      <Topbar companyName={companyName} roleLabel={roleLabelFor(role)} />
      <TabNav role={role} />
      <main className="flex-1 min-w-0 overflow-y-auto">
        {children}
        <footer className="px-6 pb-6 pt-2 max-w-6xl mx-auto flex flex-wrap justify-between gap-2 font-mono text-[11px] text-ink-3">
          <span>© ICP Solutions · Smart Buchhaltung</span>
          <span>
            {/* Release aus package.json, Build = Git-Commit des Vercel-Builds (next.config.js) */}
            Rel. {process.env.NEXT_PUBLIC_APP_VERSION ?? '0.9'}
            {process.env.NEXT_PUBLIC_BUILD_SHA ? ` · Build ${process.env.NEXT_PUBLIC_BUILD_SHA}` : ''}
          </span>
        </footer>
      </main>
    </div>
  );
}
