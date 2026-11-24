// POST /api/healthcheck – trägt Prüfläufe des täglichen Morgenlaufs ein
// (geplante Aufgabe „Kunden-Health-Check (Morgenlauf)“ in der Claude-App).
//
// Anmeldung: Header „Authorization: Bearer <HEALTHCHECK_TOKEN>“. Der Wert
// steht nur in der Umgebungsvariable (Vercel / .env.local), nie im Code.
// Ohne gesetzte Variable ist die Route geschlossen (503).
//
// Körper: ein Lauf als JSON-Objekt oder ein Array von Läufen (max. 50).
// Felder: siehe pruefeLauf() in src/lib/healthcheck.ts. Ein Lauf mit
// derselben domain und demselben datum wird kein zweites Mal angelegt.

import { createHash, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { pruefeLauf, type HealthcheckLaufInsert } from '@/lib/healthcheck';

export const dynamic = 'force-dynamic';

const MAX_LAEUFE = 50;

/** Vergleich in konstanter Zeit – über Hashes, damit auch die Länge nichts verrät */
function tokenStimmt(erhalten: string, erwartet: string): boolean {
  const a = createHash('sha256').update(erhalten).digest();
  const b = createHash('sha256').update(erwartet).digest();
  return timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  const erwartet = process.env.HEALTHCHECK_TOKEN?.trim();
  if (!erwartet || erwartet.length < 32) {
    return NextResponse.json({ error: 'Health-Check-Eingang ist nicht eingerichtet (HEALTHCHECK_TOKEN fehlt oder ist kürzer als 32 Zeichen).' }, { status: 503 });
  }

  const auth = req.headers.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token || !tokenStimmt(token, erwartet)) {
    return NextResponse.json({ error: 'Nicht berechtigt' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Körper ist kein gültiges JSON.' }, { status: 400 });
  }

  const eingaben = Array.isArray(body) ? body : [body];
  if (eingaben.length === 0) return NextResponse.json({ error: 'Keine Läufe übergeben.' }, { status: 400 });
  if (eingaben.length > MAX_LAEUFE) {
    return NextResponse.json({ error: `Höchstens ${MAX_LAEUFE} Läufe je Aufruf.` }, { status: 400 });
  }

  const laeufe: HealthcheckLaufInsert[] = [];
  const fehler: { index: number; fehler: string[] }[] = [];
  eingaben.forEach((e, index) => {
    const r = pruefeLauf(e);
    if ('lauf' in r) laeufe.push(r.lauf);
    else fehler.push({ index, fehler: r.fehler });
  });
  // Alles oder nichts: ein fehlerhafter Lauf hält die anderen nicht still zurück
  if (fehler.length > 0) return NextResponse.json({ error: 'Ungültige Läufe', details: fehler }, { status: 422 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('healthcheck_laeufe')
    .upsert(laeufe, { onConflict: 'domain,datum', ignoreDuplicates: true })
    .select('id, firma, domain, datum, ampel');

  if (error) {
    console.error('[healthcheck] Eintragen fehlgeschlagen:', error.message);
    return NextResponse.json({ error: 'Eintragen fehlgeschlagen.' }, { status: 500 });
  }

  const angelegt = data ?? [];
  return NextResponse.json(
    { angelegt: angelegt.length, uebersprungen: laeufe.length - angelegt.length, laeufe: angelegt },
    { status: angelegt.length > 0 ? 201 : 200 },
  );
}
