export const dynamic = 'force-dynamic';

// Firmen & Vermittler – /akquise/firmen (Welle 9a)
// Liste mit Art, Ort, offenen Opportunities, letzter Aktivität, Rating und ICP-Fit.

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Building2, Plus } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { getMyClientId } from '@/lib/supabase/get-my-client';
import { FIRMENART_LABEL, istOffen } from '@/lib/akquise';
import type { AcqCompany, AcqCompanyKind, AcqStage } from '@/lib/supabase/database.types';
import PageHeader from '@/components/PageHeader';
import EmptyState from '@/components/EmptyState';
import { Badge, Button, Card, CardHeader, Td, Th, Tr } from '@/components/ui';
import { datum } from '../shared';

const punkte = (n: number | null) => n == null ? '—' : '●'.repeat(n) + '○'.repeat(5 - n);

export default async function FirmenPage({ searchParams }: { searchParams: Promise<{ art?: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const clientId = await getMyClientId(supabase, user.id);
  if (!clientId) redirect('/dashboard');

  const [{ data: firmen }, { data: opps }, { data: akt }] = await Promise.all([
    supabase.from('acq_companies').select('*').eq('client_id', clientId).order('name'),
    supabase.from('acq_opportunities').select('id, company_id, end_company_id, stage').eq('client_id', clientId),
    supabase.from('acq_activities').select('opportunity_id, occurred_at').eq('client_id', clientId),
  ]);
  const { art } = await searchParams;
  const liste = ((firmen ?? []) as AcqCompany[]).filter(f => !art || f.kind === art);

  const oppsJeFirma = new Map<string, { id: string; stage: AcqStage }[]>();
  for (const o of (opps ?? []) as { id: string; company_id: string | null; end_company_id: string | null; stage: AcqStage }[]) {
    for (const fid of [o.company_id, o.end_company_id]) {
      if (!fid) continue;
      oppsJeFirma.set(fid, [...(oppsJeFirma.get(fid) ?? []), o]);
    }
  }
  const letzteJeOpp = new Map<string, string>();
  for (const a of (akt ?? []) as { opportunity_id: string; occurred_at: string }[]) {
    if ((letzteJeOpp.get(a.opportunity_id) ?? '') < a.occurred_at) letzteJeOpp.set(a.opportunity_id, a.occurred_at);
  }

  return (
    <div className="px-6 py-7 max-w-6xl mx-auto">
      <PageHeader title="Firmen & Vermittler" subtitle="Vermittler, Plattformen, Endkunden und Wunschkunden mit ihren Opportunities" icon={Building2}>
        <Button href="/akquise/firmen/neu"><Plus size={16} strokeWidth={2.5} />Firma anlegen</Button>
      </PageHeader>

      <div className="flex flex-wrap gap-1.5 mb-4">
        <Button size="sm" variant={!art ? 'primary' : 'ghost'} href="/akquise/firmen">Alle</Button>
        {(Object.keys(FIRMENART_LABEL) as AcqCompanyKind[]).map(k => (
          <Button key={k} size="sm" variant={art === k ? 'primary' : 'ghost'} href={`/akquise/firmen?art=${k}`}>{FIRMENART_LABEL[k]}</Button>
        ))}
      </div>

      {(firmen ?? []).length === 0 ? (
        <EmptyState icon={Building2} text="Noch keine Firma erfasst." hinweis="Firmen entstehen auch automatisch beim Anlegen einer Opportunity." href="/akquise/firmen/neu" cta="Erste Firma anlegen" />
      ) : (
        <Card padded={false}>
          <CardHeader title={art ? FIRMENART_LABEL[art as AcqCompanyKind] ?? 'Firmen' : 'Alle Firmen'} border>
            <span className="font-mono text-[11px] text-ink-3">{liste.length} {liste.length === 1 ? 'Eintrag' : 'Einträge'}</span>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead><tr><Th>Firma</Th><Th>Art</Th><Th>Ort</Th><Th num>Offen</Th><Th num>Gesamt</Th><Th>Letzte Aktivität</Th><Th>Rating</Th><Th>ICP-Fit</Th></tr></thead>
              <tbody>
                {liste.map(f => {
                  const os = oppsJeFirma.get(f.id) ?? [];
                  const letzte = os.map(o => letzteJeOpp.get(o.id) ?? '').sort().pop() || null;
                  return (
                    <Tr key={f.id} className={f.is_active ? '' : 'opacity-60'}>
                      <Td>
                        <Link href={`/akquise/firmen/${f.id}`} className="font-medium text-ink hover:underline">{f.name}</Link>
                        {f.tags.length > 0 && <span className="block text-[11px] text-ink-3">{f.tags.join(' · ')}</span>}
                      </Td>
                      <Td><Badge tone={f.kind === 'vermittler' ? 'info' : f.kind === 'wunschkunde' ? 'navy' : 'gray'}>{FIRMENART_LABEL[f.kind]}</Badge></Td>
                      <Td className="text-ink-2">{[f.city, f.country !== 'AT' ? f.country : null].filter(Boolean).join(', ') || '—'}</Td>
                      <Td num className="text-ink">{os.filter(o => istOffen(o.stage)).length || '—'}</Td>
                      <Td num className="text-ink-2">{os.length || '—'}</Td>
                      <Td className="num text-[12.5px] text-ink-2">{datum(letzte)}</Td>
                      <Td className="font-mono text-[11px] text-ink-2 tracking-[0.1em]">{punkte(f.rating)}</Td>
                      <Td className="font-mono text-[11px] text-ink-2 tracking-[0.1em]">{punkte(f.icp_fit)}</Td>
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
