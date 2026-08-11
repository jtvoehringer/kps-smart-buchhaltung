// GET /api/kanzlei/bmd-export?clientId=...&dateFrom=...&dateTo=...&preview=1
// Nur für Rolle kanzlei / admin / superadmin

import { NextRequest, NextResponse } from 'next/server';
import { createClient }      from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  baueBmdZeilen, baueBmdCsv, bmdSummen, nachCp1252, type BmdTransaction,
} from '@/lib/bmd/export';

const FELDER = `
  id, booking_date, description, type,
  amount_net, vat_amount, amount_gross, vat_rate,
  beleg_jahr, beleg_nr, ust_kennzeichen, is_eauto,
  bewirtung_anlass, bewirtung_teilnehmer,
  reise_typ, reise_ziel, reise_zweck, reise_von, reise_bis, reise_km, reise_stunden,
  category:categories ( name, konto_nr )
`;

/** Dateiname ohne Zeichen, die Windows oder der Content-Disposition-Header nicht mögen. */
function dateiname(firma: string, von: string, bis: string): string {
  const sauber = firma
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || 'Mandant';
  return `BMD_EA_${sauber}_${von}_${bis}.csv`;
}

export async function GET(req: NextRequest) {
  // Auth-Check
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 });

  const { data: me } = await supabase
    .from('users')
    .select('role, tenant_id')
    .eq('id', user.id)
    .maybeSingle();

  if (!me || !['admin', 'kanzlei', 'superadmin'].includes(me.role)) {
    return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 });
  }

  const { searchParams } = req.nextUrl;
  const clientId  = searchParams.get('clientId');
  const dateFrom  = searchParams.get('dateFrom');
  const dateTo    = searchParams.get('dateTo');
  const isPreview = searchParams.get('preview') === '1';

  if (!clientId || !dateFrom || !dateTo) {
    return NextResponse.json({ error: 'Parameter fehlen' }, { status: 400 });
  }

  const istDatum = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
  if (!istDatum(dateFrom) || !istDatum(dateTo)) {
    return NextResponse.json({ error: 'Datum bitte als JJJJ-MM-TT angeben.' }, { status: 400 });
  }
  if (dateFrom > dateTo) {
    return NextResponse.json({ error: 'Das Anfangsdatum liegt nach dem Enddatum.' }, { status: 400 });
  }

  // Prüfen ob Mandant zum Tenant gehört (ausser Superadmin)
  const admin = createAdminClient();

  const { data: client } = await admin
    .from('clients')
    .select('tenant_id, company_name')
    .eq('id', clientId)
    .maybeSingle();

  if (!client) {
    return NextResponse.json({ error: 'Mandant nicht gefunden' }, { status: 404 });
  }
  if (me.role !== 'superadmin' && client.tenant_id !== me.tenant_id) {
    return NextResponse.json({ error: 'Kein Zugriff auf diesen Mandanten' }, { status: 403 });
  }

  // Buchungen laden
  const { data: transactions, error: txError } = await admin
    .from('transactions')
    .select(FELDER)
    // Privatumsätze zählen steuerlich nicht mit (F-5)
    .eq('is_private', false)
    .eq('client_id', clientId)
    .gte('booking_date', dateFrom)
    .lte('booking_date', dateTo)
    .order('booking_date', { ascending: true })
    .order('created_at', { ascending: true });

  if (txError) {
    return NextResponse.json({ error: txError.message }, { status: 500 });
  }

  const liste = (transactions ?? []) as unknown as BmdTransaction[];
  const rows  = baueBmdZeilen(liste);

  if (isPreview) {
    return NextResponse.json({ rows, summen: bmdSummen(liste) });
  }

  // CSV-Download. Windows-1252, weil BMD NTCS das beim Import erwartet –
  // und weil der Header das bisher zwar behauptet, aber nicht geliefert hat.
  const bytes = nachCp1252(baueBmdCsv(rows));

  return new NextResponse(bytes as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=windows-1252',
      'Content-Length': String(bytes.byteLength),
      'Content-Disposition':
        `attachment; filename="${dateiname(client.company_name ?? '', dateFrom, dateTo)}"`,
      'Cache-Control': 'no-store',
    },
  });
}
