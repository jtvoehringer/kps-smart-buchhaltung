// Jahreswahl per Link (Server-Seite liest ?jahr=) – gleiche Optik wie der ZeitraumWähler
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function JahrWaehler({ jahre, jahr, basis = '/anlagen' }: { jahre: number[]; jahr: number; basis?: string }) {
  const vor = jahre.filter(j => j < jahr).pop();
  const nach = jahre.filter(j => j > jahr).shift();
  const cls = (aktiv: boolean) =>
    `w-8 h-8 inline-flex items-center justify-center rounded-md border border-line-2 bg-card text-ink-2 hover:bg-row hover:text-navy ${aktiv ? '' : 'opacity-30 pointer-events-none'}`;
  return (
    <div className="flex items-center gap-1 print:hidden">
      <Link href={vor ? `${basis}?jahr=${vor}` : '#'} aria-disabled={!vor} className={cls(!!vor)}><ChevronLeft size={15} strokeWidth={2} /></Link>
      <span className="num font-semibold text-navy text-[17px] w-14 text-center">{jahr}</span>
      <Link href={nach ? `${basis}?jahr=${nach}` : '#'} aria-disabled={!nach} className={cls(!!nach)}><ChevronRight size={15} strokeWidth={2} /></Link>
    </div>
  );
}
