'use client';

// Navy-Kopfleiste (Design-Review Welle 4, nach dem HR-Suite-PoC):
// links das ICP-Lockup und der Produktname, in der Mitte der Mandant,
// rechts Rolle und Release. Die dunkle Fläche lebt nur noch hier –
// die Navigation darunter ist hell.

import Image from 'next/image';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';

export default function Topbar({
  companyName,
  roleLabel,
  mobileOpen,
  onToggleMobile,
}: {
  companyName: string;
  roleLabel: string;
  mobileOpen: boolean;
  onToggleMobile: () => void;
}) {
  const release = process.env.NEXT_PUBLIC_APP_VERSION ?? '0.9';
  const build   = process.env.NEXT_PUBLIC_BUILD_SHA;

  return (
    <header className="bg-navy text-white shrink-0 z-40">
      <div className="h-14 px-4 md:px-6 flex items-center gap-4 md:gap-5">
        <button
          type="button"
          onClick={onToggleMobile}
          aria-label={mobileOpen ? 'Menü schließen' : 'Menü öffnen'}
          className="md:hidden -ml-1 w-9 h-9 inline-flex items-center justify-center rounded-md hover:bg-white/10"
        >
          {mobileOpen ? <X size={18} strokeWidth={2} /> : <Menu size={18} strokeWidth={2} />}
        </button>

        <Link href="/dashboard" className="flex items-center gap-4 md:gap-5 min-w-0 group">
          <Image
            src="/icp-lockup-weiss.png"
            alt="ICP Solutions"
            width={96}
            height={32}
            className="h-[26px] w-auto transition-opacity group-hover:opacity-85"
            priority
          />
          <span className="hidden sm:block text-[15px] font-medium tracking-[0.02em] opacity-90 border-l border-white/25 pl-4 md:pl-5 whitespace-nowrap">
            Smart Buchhaltung
          </span>
        </Link>

        <div className="min-w-0 flex-1 truncate text-[13.5px] text-white/75 hidden md:block">
          {companyName}
        </div>

        <div className="ml-auto flex items-center gap-2.5 shrink-0">
          <span className="hidden md:inline font-mono text-[11px] tracking-[0.08em] uppercase text-white/60">
            {roleLabel}
          </span>
          <span
            className="font-mono text-[11px] font-semibold tracking-[0.08em] bg-signal text-[#0b2540] rounded-sm px-2.5 py-[3px] whitespace-nowrap"
            title={build ? `Build ${build}` : undefined}
          >
            REL. {release}
          </span>
        </div>
      </div>
    </header>
  );
}
