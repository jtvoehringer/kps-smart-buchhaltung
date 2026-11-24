import { cn } from '@/lib/utils';
import { AMPEL_LABEL, type Ampel } from '@/lib/healthcheck';

/** Runder Ampelpunkt (grün/gelb/rot) mit Beschriftung für Screenreader */
export default function Ampelpunkt({ ampel, className }: { ampel: Ampel; className?: string }) {
  const farbe = { gruen: 'bg-good', gelb: 'bg-warn-bar', rot: 'bg-crit' }[ampel];
  return <i className={cn('inline-block w-3 h-3 rounded-full shrink-0', farbe, className)} aria-label={AMPEL_LABEL[ampel]} role="img" />;
}
