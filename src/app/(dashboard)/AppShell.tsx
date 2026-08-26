'use client';

// Rahmen aller Dashboard-Seiten (Design-Review Welle 4):
// Navy-Kopfleiste oben, darunter helle Sidebar links und Inhalt rechts.
// Hält nur den Zustand des Mobile-Menüs – alles andere kommt vom Layout.

import { useState } from 'react';
import Topbar from './Topbar';
import Sidebar, { roleLabelFor } from './Sidebar';

export default function AppShell({
  companyName,
  role,
  children,
}: {
  companyName: string;
  role: string;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-bg">
      <Topbar
        companyName={companyName}
        roleLabel={roleLabelFor(role)}
        mobileOpen={mobileOpen}
        onToggleMobile={() => setMobileOpen(o => !o)}
      />

      <div className="flex-1 flex min-h-0 relative">
        <aside className="hidden md:flex flex-col w-[232px] shrink-0 border-r border-line">
          <Sidebar companyName={companyName} role={role} />
        </aside>

        {mobileOpen && (
          <>
            <div
              className="fixed inset-0 top-14 bg-[rgb(16_32_52/0.5)] z-30 md:hidden"
              onClick={() => setMobileOpen(false)}
              aria-hidden
            />
            <aside className="fixed top-14 bottom-0 left-0 z-40 w-[264px] flex flex-col border-r border-line md:hidden">
              <Sidebar companyName={companyName} role={role} onNavigate={() => setMobileOpen(false)} />
            </aside>
          </>
        )}

        <main className="flex-1 min-w-0 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
