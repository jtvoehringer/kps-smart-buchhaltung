// API-Route: Module für einen Mandanten setzen
// Nur Superadmin darf das – wird serverseitig geprüft
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 });

  // Rolle prüfen – nur superadmin
  const { data: me } = await supabase
    .from('users').select('role').eq('id', user.id).maybeSingle();
  if (me?.role !== 'superadmin') {
    return NextResponse.json({ error: 'Keine Berechtigung' }, { status: 403 });
  }

  const { clientId, modules } = await req.json();
  if (!clientId || !Array.isArray(modules)) {
    return NextResponse.json({ error: 'Ungültige Parameter' }, { status: 400 });
  }

  // Erlaubte Module validieren
  const ALLOWED = ['invoicing', 'ocr'];
  const clean = modules.filter((m: string) => ALLOWED.includes(m));

  const admin = createAdminClient();
  const { error } = await admin
    .from('clients')
    .update({ modules_enabled: clean })
    .eq('id', clientId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, modules: clean });
}
