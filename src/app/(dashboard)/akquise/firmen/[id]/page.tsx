export const dynamic = 'force-dynamic';

// Firma-Detail – /akquise/firmen/[id] (Welle 9a): Stammdaten,
// Ansprechpersonen und alle Opportunities der Firma.

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Plus } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { getMyClientId } from '@/lib/supabase/get-my-client';
import { FIRMENART_LABEL } from '@/lib/akquise';
import type { AcqCompany, AcqOpportunity, AcqPerson } from '@/lib/supabase/database.types';
import { Badge, Button, Card, CardHeader, Td, Th, Tr } from '@/components/ui';
import { ArtBadge, StageBadge, datum, firmaText } from '../../shared';
import FirmaForm from '../FirmaForm';
import Personen from './Personen';

export default async function FirmaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const clientId = await getMyClientId(supabase, user.id);
  if (!clientId) redirect('/dashboard');

  const { data: f } = await supabase.from('acq_companies').select('*').eq('id', id).eq('client_id', clientId).maybeSingle();
  if (!f) notFound();
  const firma = f as AcqCompany;

  const [{ data: personen }, { data: opps }, { data: alle }] = await Promise.all([
    supabase.from('acq_people').select('*').eq('company_id', id).order('is_primary', { ascending: false }).order('last_name'),
    supabase.from('acq_opportunities').select('*').eq('client_id', clientId).or(`company_id.eq.${id},end_company_id.eq.${id}`).order('applied_on', { ascending: false }),
    supabase.from('acq_companies').select('id, name').eq('client_id', clientId),
  ]);
  const firmen = new Map(((alle ?? []) as { id: string; name: string }[]).map(x => [x.id, x]));
  const liste = (opps ?? []) as AcqOpportunity[];

  return (
    <div className="px-6 py-7 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <Link href="/akquise/firmen" className="text-ink-3 hover:text-navy transition-colors text-sm">← Firmen & Vermittler</Link>
        <span className="text-ink-3">/</span>
        <h1 className="text-2xl font-semibold text-navy tracking-[-0.01em] min-w-0">{firma.name}</h1>
        <Badge tone="gray">{FIRMENART_LABEL[firma.kind]}</Badge>
        {firma.customer_id && <Link href={`/kunden/${firma.customer_id}`}><Badge tone="good">Kunde</Badge></Link>}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-5 items-start">
        <div className="space-y-5">
          <Card padded={false}>
            <CardHeader title="Opportunities" border>
              <Button size="sm" href={`/akquise/neu?firma=${firma.id}`}><Plus size={14} />Opportunity</Button>
            </CardHeader>
            {liste.length === 0 ? (
              <p className="px-5 py-6 text-[13px] text-ink-3">Noch keine Opportunity bei dieser Firma.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] text-sm">
                  <thead><tr><Th>Opportunity</Th><Th>Art</Th><Th>Stage</Th><Th>Beworben</Th></tr></thead>
                  <tbody>
                    {liste.map(o => (
                      <Tr key={o.id}>
                        <Td>
                          <Link href={`/akquise/${o.id}`} className="font-medium text-ink hover:underline">{o.title}</Link>
                          <span className="block text-[11.5px] text-ink-3">{firmaText(o, firmen)}</span>
                        </Td>
                        <Td><ArtBadge kind={o.kind} /></Td>
                        <Td><StageBadge stage={o.stage} kind={o.kind} /></Td>
                        <Td className="num text-[12.5px] text-ink-2">{datum(o.applied_on)}</Td>
                      </Tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
          <FirmaForm clientId={clientId} firma={firma} />
        </div>
        <Personen clientId={clientId} companyId={firma.id} personen={(personen ?? []) as AcqPerson[]} />
      </div>
    </div>
  );
}
