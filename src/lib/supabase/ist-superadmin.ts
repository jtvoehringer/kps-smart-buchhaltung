import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Ist der angemeldete Benutzer Superadmin (ICP)? Steuert, ob der
 * Kunden-Health-Check sichtbar ist. Die Datenbank prüft dasselbe
 * zusätzlich per RLS (is_superadmin()) – das hier ist nur die Oberfläche.
 */
export async function istSuperadmin(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data } = await supabase.from('users').select('role').eq('id', userId).maybeSingle();
  return data?.role === 'superadmin';
}
