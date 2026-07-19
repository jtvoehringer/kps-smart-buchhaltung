import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Gibt die client_id des eingeloggten Users zurück.
 * Strategie 1: SECURITY DEFINER RPC (umgeht RLS-Zirkel)
 * Strategie 2: Direktabfrage client_memberships (Fallback)
 */
export async function getMyClientId(
  supabase: SupabaseClient,
  userId: string
): Promise<string | null> {
  // Strategie 1: SECURITY DEFINER Funktion per RPC
  const { data: rpcData, error: rpcError } = await supabase.rpc('get_my_client_ids');
  if (!rpcError && rpcData && rpcData.length > 0) {
    const first = rpcData[0];
    // PostgREST gibt SETOF UUID als Array von Objekten zurück: [{ get_my_client_ids: "uuid" }]
    if (typeof first === 'string') return first;
    if (first && typeof first === 'object') {
      const val = (first as Record<string, unknown>)['get_my_client_ids'];
      if (typeof val === 'string') return val;
    }
  }

  // Strategie 2: Direktabfrage (funktioniert wenn RLS-Policies korrekt gesetzt)
  const { data } = await supabase
    .from('client_memberships')
    .select('client_id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();
  return data?.client_id ?? null;
}
