// Mandant-Detailseite – /kanzlei/mandant/[id]
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import MandantUserManager from './MandantUserManager';
import InklusivCard from './ModulToggle';

export default async function MandantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: me } = await supabase
    .from('users')
    .select('role, tenant_id')
    .eq('id', user.id)
    .maybeSingle();

  if (!me || !['admin', 'kanzlei', 'superadmin'].includes(me.role)) {
    redirect('/dashboard');
  }

  // Mandant laden (inkl. USt-Status)
  let clientQuery = supabase
    .from('clients')
    .select(`
      id, company_name, uid_number, vat_period, is_active,
      ust_status, regelbesteuerung_optiert, regelbesteuerung_options_jahr, regelbesteuerung_bindung_bis
    `)
    .eq('id', id);

  if (me.role !== 'superadmin') {
    clientQuery = clientQuery.eq('tenant_id', me.tenant_id);
  }

  const { data: client } = await clientQuery.maybeSingle();
  if (!client) redirect('/kanzlei');

  // Memberships + User-Details
  const { data: memberships } = await supabase
    .from('client_memberships')
    .select('user_id')
    .eq('client_id', client.id);

  const userIds = (memberships ?? []).map(m => m.user_id);

  const { data: memberUsers } = userIds.length > 0
    ? await supabase
        .from('users')
        .select('id, email, full_name')
        .in('id', userIds)
    : { data: [] };

  const members = userIds.map(uid => {
    const u = (memberUsers ?? []).find(u => u.id === uid);
    return { userId: uid, email: u?.email ?? '', fullName: u?.full_name ?? '' };
  });

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Breadcrumb + Titel */}
      <div className="mb-6 flex items-center gap-2 flex-wrap">
        <Link href="/kanzlei" className="text-gray-400 hover:text-gray-600 text-sm transition-colors">
          ← Kanzlei
        </Link>
        <span className="text-gray-300">/</span>
        <h1 className="text-2xl font-bold text-brand">{client.company_name}</h1>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
          client.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
        }`}>
          {client.is_active ? 'Aktiv' : 'Inaktiv'}
        </span>
      </div>

      {/* Stammdaten */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 mb-5">
        <h2 className="font-semibold text-gray-700 mb-4">Stammdaten</h2>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
          <div>
            <dt className="text-gray-400 text-xs uppercase tracking-wide mb-0.5">UID-Nummer</dt>
            <dd className="text-gray-700">{client.uid_number || '—'}</dd>
          </div>
          <div>
            <dt className="text-gray-400 text-xs uppercase tracking-wide mb-0.5">UVA-Zeitraum</dt>
            <dd className="text-gray-700">
              {client.vat_period === 'monthly' ? 'Monatlich' : 'Vierteljährlich'}
            </dd>
          </div>
          <div>
            <dt className="text-gray-400 text-xs uppercase tracking-wide mb-0.5">USt-Status</dt>
            <dd className="text-gray-700">
              {client.ust_status === 'kleinunternehmer' ? 'Kleinunternehmer (befreit)' : 'Regelbesteuerung'}
            </dd>
          </div>
          <div>
            <dt className="text-gray-400 text-xs uppercase tracking-wide mb-0.5">Regelbesteuerungsantrag (U12)</dt>
            <dd className="text-gray-700">
              {client.regelbesteuerung_optiert
                ? `Optiert ${client.regelbesteuerung_options_jahr} · bindend bis ${client.regelbesteuerung_bindung_bis}`
                : '—'}
            </dd>
          </div>
        </dl>
        <p className="text-xs text-gray-400 mt-3">
          Änderungen an UID, UVA-Zeitraum und USt-Status nimmt der Mandant selbst unter „Einstellungen" vor.
        </p>
      </div>

      {/* Inklusivleistungen – nur für Superadmin sichtbar */}
      {me.role === 'superadmin' && <InklusivCard />}

      {/* User-Verwaltung */}
      <MandantUserManager clientId={client.id} members={members} />
    </div>
  );
}
