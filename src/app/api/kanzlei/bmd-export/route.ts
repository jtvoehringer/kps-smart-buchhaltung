// GET /api/kanzlei/bmd-export?clientId=...&dateFrom=...&dateTo=...&preview=1
// Nur für Rolle kanzlei / admin / superadmin

import { NextRequest, NextResponse } from 'next/server';
import { createClient }      from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// BMD NTCS: Dezimalzahl mit Komma, Tausenderpunkt
function bmdNum(n: number): string {
  return n.toFixed(2).replace('.', ',');
}

// BMD NTCS: Datum TT.MM.JJJJ
function bmdDate(iso: string): string {
  const [y, m, d] = iso.split('T')[0].split('-');
  return `${d}.${m}.${y}`;
}

// Konto nach Typ (einfache Standardzuordnung – im BMD nachpflegen)
function konto(type: string): string {
  return type === 'income' ? '4000' : '5000';
}

type Transaction = {
  id: string;
  booking_date: string;
  description: string | null;
  type: 'income' | 'expense';
  amount_net: number;
  vat_amount: number;
  amount_gross: number;
  vat_rate: number;
};

function buildRows(transactions: Transaction[]) {
  return transactions.map((t, i) => {
    const net   = Number(t.amount_net);
    const vat   = Number(t.vat_amount);
    const gross = Number(t.amount_gross);
    // Ausgaben als negative Werte im BMD
    const sign  = t.type === 'expense' ? -1 : 1;
    return {
      datum:        bmdDate(t.booking_date),
      belegnr:      String(i + 1).padStart(4, '0'),
      text:         (t.description ?? '').replace(/;/g, ','),
      netto:        bmdNum(sign * net),
      steuerProzent: Number(t.vat_rate),
      steuer:       bmdNum(sign * vat),
      brutto:       bmdNum(sign * gross),
      konto:        konto(t.type),
      type:         t.type,
    };
  });
}

function buildCsv(rows: ReturnType<typeof buildRows>): string {
  const header = 'Datum;BelegNr;Text;Netto;Steuer%;Steuer;Brutto;Konto';
  const lines  = rows.map(r =>
    [r.datum, r.belegnr, r.text, r.netto, r.steuerProzent, r.steuer, r.brutto, r.konto].join(';')
  );
  return [header, ...lines].join('\r\n');
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

  // Prüfen ob Mandant zum Tenant gehört (ausser Superadmin)
  const admin = createAdminClient();

  if (me.role !== 'superadmin') {
    const { data: client } = await admin
      .from('clients')
      .select('tenant_id')
      .eq('id', clientId)
      .maybeSingle();
    if (!client || client.tenant_id !== me.tenant_id) {
      return NextResponse.json({ error: 'Kein Zugriff auf diesen Mandanten' }, { status: 403 });
    }
  }

  // Buchungen laden
  const { data: transactions, error: txError } = await admin
    .from('transactions')
    .select('id, booking_date, description, type, amount_net, vat_amount, amount_gross, vat_rate')
    .eq('client_id', clientId)
    .gte('booking_date', dateFrom)
    .lte('booking_date', dateTo)
    .order('booking_date', { ascending: true })
    .order('created_at', { ascending: true });

  if (txError) {
    return NextResponse.json({ error: txError.message }, { status: 500 });
  }

  const rows = buildRows((transactions ?? []) as Transaction[]);

  if (isPreview) {
    return NextResponse.json({ rows });
  }

  // CSV-Download (ISO-8859-1 für BMD-Kompatibilität)
  const csv = buildCsv(rows);

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=iso-8859-1',
      'Content-Disposition': `attachment; filename="BMD_EA_Export.csv"`,
    },
  });
}
