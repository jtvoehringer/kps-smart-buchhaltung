import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Gibt die client_id des eingeloggten Users zurück.
 *
 * Diese Funktion entscheidet, wessen Daten die gesamte Oberfläche
 * zeigt. Sie muss deshalb bei jedem Aufruf dasselbe liefern – vorher
 * nahm sie schlicht den ersten Treffer einer Abfrage ohne
 * Sortierung. Wer zu zwei Mandanten gehört, hätte damit beim einen
 * Seitenaufruf den einen und beim nächsten den anderen sehen können.
 *
 * Maßgeblich ist der zuerst zugeordnete Mandant, hilfsweise die
 * kleinere client_id.
 *
 * Strategie 1: Direktabfrage mit fester Sortierung.
 * Strategie 2: SECURITY DEFINER RPC (falls die RLS-Policy auf
 *              client_memberships selbst blockiert).
 */
export async function getMyClientId(
  supabase: SupabaseClient,
  userId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('client_memberships')
    .select('client_id, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .order('client_id',  { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!error && data?.client_id) return data.client_id;

  // Fallback über die SECURITY DEFINER-Funktion. PostgREST liefert
  // SETOF UUID je nach Version als Array von Strings oder als Array
  // von Objekten – beides wird hier abgedeckt.
  const { data: rpcData, error: rpcError } = await supabase.rpc('get_my_client_ids');
  if (rpcError || !Array.isArray(rpcData) || rpcData.length === 0) return null;

  const ids = rpcData
    .map((eintrag: unknown) => {
      if (typeof eintrag === 'string') return eintrag;
      if (eintrag && typeof eintrag === 'object') {
        const wert = (eintrag as Record<string, unknown>)['get_my_client_ids'];
        if (typeof wert === 'string') return wert;
      }
      return null;
    })
    .filter((id): id is string => !!id)
    // Die Funktion sortiert nicht – ohne diese Zeile hinge die Auswahl
    // wieder von der Reihenfolge der Tabelle ab.
    .sort();

  return ids[0] ?? null;
}
