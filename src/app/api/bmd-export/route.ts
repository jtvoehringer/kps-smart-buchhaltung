// GET /api/bmd-export?dateFrom=...&dateTo=...&preview=1
// Export der E/A-Buchungen im BMD-NTCS-Format für den Steuerberater –
// immer für den eigenen Betrieb (Welle 7: keine Rollen/Mandantenwahl mehr).

import { NextRequest, NextResponse } from 'next/server';
import { createClient }      from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getMyClientId } from '@/lib/supabase/get-my-client';
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

  const clientId = await getMyClientId(supabase, user.id);
  if (!clientId) {
    return NextResponse.json({ error: 'Kein Betrieb zugeordnet' }, { status: 403 });
  }

  const { searchParams } = req.nextUrl;
  const dateFrom  = searchParams.get('dateFrom');
  const dateTo    = searchParams.get('dateTo');
  const isPreview = searchParams.get('preview') === '1';

  if (!dateFrom || !dateTo) {
    return NextResponse.json({ error: 'Parameter fehlen' }, { status: 400 });
  }

  const istDatum = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
  if (!istDatum(dateFrom) || !istDatum(dateTo)) {
    return NextResponse.json({ error: 'Datum bitte als JJJJ-MM-TT angeben.' }, { status: 400 });
  }
  if (dateFrom > dateTo) {
    return NextResponse.json({ error: 'Das Anfangsdatum liegt nach dem Enddatum.' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: client } = await admin
    .from('clients')
    .select('company_name')
    .eq('id', clientId)
    .maybeSingle();
  if (!client) {
    return NextResponse.json({ error: 'Betrieb nicht gefunden' }, { status: 404 });
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
