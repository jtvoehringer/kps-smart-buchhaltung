'use client';

// Navy-Kopfleiste (Design-Review Welle 4, nach dem HR-Suite-PoC):
// links das ICP-Lockup und der Produktname, dann der Mandant, rechts
// Release und Abmelden. Die dunkle Fläche lebt nur hier – die
// Navigation darunter (TabNav) ist hell.

import Image from 'next/image';
import Link from 'next/link';
import { LogOut, Search } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export default function Topbar({ companyName }: { companyName: string }) {
  const release = process.env.NEXT_PUBLIC_APP_VERSION ?? '0.9';
  const build   = process.env.NEXT_PUBLIC_BUILD_SHA;

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = '/login';
  }

  return (
    <header className="bg-navy text-white shrink-0 z-40 print:hidden">
      <div className="h-14 max-w-6xl mx-auto px-4 md:px-6 flex items-center gap-3 md:gap-5">
        <Link href="/dashboard" className="flex items-center gap-3 md:gap-5 min-w-0 shrink-0 group">
          {/* Querformat-Lockup wie im HR-Suite-PoC und LSB Cockpit (Wunsch 26.08.2026) */}
          <Image
            src="/icp-lockup-weiss-quer.svg"
            alt="ICP Solutions"
            width={119}
            height={26}
            className="h-[24px] md:h-[26px] w-auto transition-opacity group-hover:opacity-85"
            priority
          />
          <span className="hidden sm:block text-[15px] font-medium tracking-[0.02em] opacity-90 border-l border-white/25 pl-3 md:pl-5 whitespace-nowrap">
            E&amp;A Suite
          </span>
        </Link>

        {/* Mandant – als solcher beschriftet, damit klar ist, wessen Daten gezeigt werden */}
        <div className="min-w-0 flex-1 flex items-baseline gap-2 truncate" title={`Mandant: ${companyName}`}>
          <span className="hidden md:inline font-mono text-[10.5px] tracking-[0.08em] uppercase text-white/45 shrink-0">Mandant</span>
          <span className="truncate text-[13.5px] text-white/80">{companyName}</span>
        </div>

        <div className="ml-auto flex items-center gap-2 md:gap-3 shrink-0">
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event('sb:palette'))}
            className="inline-flex items-center gap-2 h-8 px-2.5 rounded-md bg-white/10 hover:bg-white/15 text-white/80 hover:text-white text-[13px] transition-colors"
            title="Suchen oder Befehl (Strg K)"
          >
            <Search size={15} strokeWidth={1.75} />
            <span className="hidden lg:inline">Suchen oder Befehl …</span>
            <kbd className="hidden md:inline font-mono text-[10.5px] text-white/60 border border-white/25 rounded-sm px-1.5 py-px">Strg K</kbd>
          </button>
          <span
            className="font-mono text-[11px] font-semibold tracking-[0.08em] bg-signal text-[#0b2540] rounded-sm px-2.5 py-[3px] whitespace-nowrap"
            title={build ? `Build ${build}` : undefined}
          >
            REL. {release}
          </span>
          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex items-center gap-1.5 h-8 px-2 md:px-2.5 rounded-md text-[13px] text-white/80 hover:bg-white/10 hover:text-white transition-colors"
            title="Abmelden"
          >
            <LogOut size={16} strokeWidth={1.75} />
            <span className="hidden md:inline">Abmelden</span>
          </button>
        </div>
      </div>
    </header>
  );
}
