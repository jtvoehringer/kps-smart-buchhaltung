// Gemeinsames Laden für Übersicht und Verlauf des Kunden-Health-Checks.
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { istSuperadmin } from '@/lib/supabase/ist-superadmin';
import type { HealthcheckLauf } from '@/lib/healthcheck';

export type Laden =
  | { ok: true; laeufe: HealthcheckLauf[] }
  | { ok: false; grund: 'tabelle-fehlt' | 'fehler'; meldung: string };

/** Alle Läufe, jüngste zuerst. Nur für Superadmins – sonst 404, wie eine nicht vorhandene Seite. */
export async function ladeLaeufe(): Promise<Laden> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  if (!(await istSuperadmin(supabase, user.id))) notFound();

  const { data, error } = await supabase
    .from('healthcheck_laeufe')
    .select('*')
    .order('datum', { ascending: false })
    .limit(2000);

  if (error) {
    // 42P01 = Postgres „relation does not exist“, PGRST205 = PostgREST kennt die Tabelle nicht
    const fehlt = error.code === '42P01' || error.code === 'PGRST205';
    return { ok: false, grund: fehlt ? 'tabelle-fehlt' : 'fehler', meldung: error.message };
  }
  // NUMERIC kann je nach PostgREST-Version als Text kommen
  const laeufe = ((data ?? []) as HealthcheckLauf[]).map(l => ({
    ...l,
    db_mb: l.db_mb === null || l.db_mb === undefined ? null : Number(l.db_mb),
  }));
  return { ok: true, laeufe };
}
