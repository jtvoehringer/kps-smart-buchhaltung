export const dynamic = 'force-dynamic';

// Akquise-Journal – /akquise/aktivitaeten (Welle 9a): alle Aktivitäten
// chronologisch, filterbar nach Art und Zeitraum.

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowDownLeft, ArrowUpRight, History } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { getMyClientId } from '@/lib/supabase/get-my-client';
import { AKTIVITAET_LABEL, addTage, isoDatum } from '@/lib/akquise';
import type { AcqActivity, AcqActivityKind, AcqOpportunity } from '@/lib/supabase/database.types';
import PageHeader from '@/components/PageHeader';
import EmptyState from '@/components/EmptyState';
import { Badge, Button, Card, CardHeader, Td, Th, Tr } from '@/components/ui';
import { datum, firmaText } from '../shared';

const ZEITRAEUME: [string, string][] = [['7', '7 Tage'], ['30', '30 Tage'], ['90', '90 Tage'], ['', 'alle']];

export default async function AktivitaetenPage({ searchParams }: { searchParams: Promise<{ art?: string; tage?: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const clientId = await getMyClientId(supabase, user.id);
  if (!clientId) redirect('/dashboard');

  const { art, tage = '30' } = await searchParams;
  const gueltigeArt = art && art in AKTIVITAET_LABEL ? (art as AcqActivityKind) : null;

  let q = supabase.from('acq_activities').select('*').eq('client_id', clientId).order('occurred_at', { ascending: false }).limit(500);
  if (gueltigeArt) q = q.eq('kind', gueltigeArt);
  if (tage) q = q.gte('occurred_at', new Date(`${addTage(isoDatum(), -Number(tage))}T00:00:00`).toISOString());

  const [{ data: akt }, { data: opps }, { data: firmen }] = await Promise.all([
    q,
    supabase.from('acq_opportunities').select('id, title, company_id, end_company_id').eq('client_id', clientId),
    supabase.from('acq_companies').select('id, name').eq('client_id', clientId),
  ]);
  const oppMap = new Map(((opps ?? []) as Pick<AcqOpportunity, 'id' | 'title' | 'company_id' | 'end_company_id'>[]).map(o => [o.id, o]));
  const firmenMap = new Map(((firmen ?? []) as { id: string; name: string }[]).map(f => [f.id, f]));
  const liste = (akt ?? []) as AcqActivity[];

  const link = (p: { art?: string | null; tage?: string }) => {
    const s = new URLSearchParams();
    const a = p.art === undefined ? gueltigeArt : p.art;
    const t = p.tage === undefined ? tage : p.tage;
    if (a) s.set('art', a);
    s.set('tage', t);
    return `/akquise/aktivitaeten?${s}`;
  };

  return (
    <div className="px-6 py-7 max-w-6xl mx-auto">
      <PageHeader title="Akquise-Journal" subtitle="Alle Touchpoints und Gespräche in zeitlicher Reihenfolge" icon={History} />

      <div className="flex flex-wrap items-center gap-1.5 mb-2">
        <Button size="sm" variant={!gueltigeArt ? 'primary' : 'ghost'} href={link({ art: null })}>Alle Arten</Button>
        {(Object.keys(AKTIVITAET_LABEL) as AcqActivityKind[]).map(k => (
          <Button key={k} size="sm" variant={gueltigeArt === k ? 'primary' : 'ghost'} href={link({ art: k })}>{AKTIVITAET_LABEL[k]}</Button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 mb-4">
        {ZEITRAEUME.map(([t, l]) => (
          <Button key={l} size="sm" variant={tage === t ? 'secondary' : 'ghost'} href={link({ tage: t })}>{l}</Button>
        ))}
      </div>

      {liste.length === 0 ? (
        <EmptyState icon={History} text="Keine Aktivitäten in diesem Zeitraum." hinweis="Aktivitäten erfasst du in der Timeline einer Opportunity." href="/akquise" cta="Zur Pipeline" />
      ) : (
        <Card padded={false}>
          <CardHeader title={gueltigeArt ? AKTIVITAET_LABEL[gueltigeArt] : 'Alle Aktivitäten'} border>
            <span className="font-mono text-[11px] text-ink-3">{liste.length} {liste.length === 1 ? 'Eintrag' : 'Einträge'}</span>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead><tr><Th>Datum</Th><Th>Art</Th><Th>Opportunity</Th><Th>Inhalt</Th></tr></thead>
              <tbody>
                {liste.map(a => {
                  const o = oppMap.get(a.opportunity_id);
                  return (
                    <Tr key={a.id}>
                      <Td className="num text-[12.5px] text-ink-2 whitespace-nowrap">{datum(a.occurred_at)}</Td>
                      <Td>
                        <span className="inline-flex items-center gap-1">
                          <Badge tone={a.kind === 'zusage' ? 'good' : a.kind === 'absage' ? 'crit' : a.kind === 'notiz' ? 'gray' : 'info'}>{AKTIVITAET_LABEL[a.kind]}</Badge>
                          {a.direction === 'ein' && <ArrowDownLeft size={13} className="text-ink-3" aria-label="eingehend" />}
                          {a.direction === 'aus' && <ArrowUpRight size={13} className="text-ink-3" aria-label="ausgehend" />}
                        </span>
                      </Td>
                      <Td>
                        {o ? (
                          <>
                            <Link href={`/akquise/${o.id}`} className="font-medium text-ink hover:underline">{o.title}</Link>
                            <span className="block text-[11.5px] text-ink-3">{firmaText(o, firmenMap)}</span>
                          </>
                        ) : '—'}
                      </Td>
                      <Td className="text-ink-2">
                        {a.summary ?? (a.body ? a.body.slice(0, 120) : '—')}
                        {a.documents.length > 0 && <span className="block text-[11px] text-ink-3">{a.documents.length} {a.documents.length === 1 ? 'Dokument' : 'Dokumente'}</span>}
                      </Td>
                    </Tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
