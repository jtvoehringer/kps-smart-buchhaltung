'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';

async function authorizeKanzlei() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Nicht eingeloggt.', user: null, me: null };

  const { data: me } = await supabase
    .from('users')
    .select('role, tenant_id')
    .eq('id', user.id)
    .maybeSingle();

  if (!me || !['admin', 'kanzlei', 'superadmin'].includes(me.role)) {
    return { error: 'Keine Berechtigung.', user: null, me: null };
  }

  return { error: null, user, me };
}

export async function addUserToMandant(clientId: string, email: string) {
  try {
    const { error: authError, user, me } = await authorizeKanzlei();
    if (authError || !user || !me) return { error: authError };

    const adminSupabase = createAdminClient();

    // Mandant muss zum eigenen Tenant gehören
    const { data: client } = await adminSupabase
      .from('clients')
      .select('id, tenant_id')
      .eq('id', clientId)
      .eq('tenant_id', me.tenant_id)
      .maybeSingle();

    if (!client) return { error: 'Mandant nicht gefunden.' };

    // 1. Prüfen ob User in public.users existiert
    const { data: existingUser } = await adminSupabase
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    let targetUserId: string;

    if (existingUser) {
      // User bekannt → direkt verwenden
      targetUserId = existingUser.id;
    } else {
      // Nicht in public.users – prüfen ob Auth-Account vorhanden
      const { data: authUserId } = await adminSupabase
        .rpc('get_auth_user_id_by_email', { p_email: email });

      if (authUserId) {
        // Auth-Account vorhanden aber kein public.users-Eintrag → anlegen
        targetUserId = authUserId as string;
        const { error: userError } = await adminSupabase.from('users').insert({
          id:        targetUserId,
          tenant_id: me.tenant_id,
          email,
          role:      'klient',
        });
        if (userError && userError.code !== '23505') {
          return { error: `User-Eintrag fehlgeschlagen: ${userError.message}` };
        }
      } else {
        // Komplett neuer User → per E-Mail einladen
        const { data: inviteData, error: inviteError } =
          await adminSupabase.auth.admin.inviteUserByEmail(email);
        if (inviteError) return { error: `Einladung fehlgeschlagen: ${inviteError.message}` };

        targetUserId = inviteData.user.id;

        const { error: userError } = await adminSupabase.from('users').insert({
          id:        targetUserId,
          tenant_id: me.tenant_id,
          email,
          role:      'klient',
        });
        if (userError) return { error: `User-Eintrag fehlgeschlagen: ${userError.message}` };
      }
    }

    // Mitgliedschaft anlegen
    const { error: memberError } = await adminSupabase
      .from('client_memberships')
      .insert({ client_id: clientId, user_id: targetUserId, invited_by: user.id });

    if (memberError) {
      if (memberError.code === '23505') {
        return { error: 'Dieser Benutzer hat bereits Zugriff auf diesen Mandanten.' };
      }
      return { error: `Fehler beim Hinzufügen: ${memberError.message}` };
    }

    revalidatePath(`/kanzlei/mandant/${clientId}`);
    return { error: null };

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { error: `Unerwarteter Fehler: ${msg}` };
  }
}

export async function removeUserFromMandant(clientId: string, userId: string) {
  try {
    const { error: authError, me } = await authorizeKanzlei();
    if (authError || !me) return { error: authError };

    const adminSupabase = createAdminClient();

    // Mindestens ein Mitglied muss bleiben
    const { count } = await adminSupabase
      .from('client_memberships')
      .select('*', { count: 'exact', head: true })
      .eq('client_id', clientId);

    if ((count ?? 0) <= 1) {
      return { error: 'Der letzte Benutzer kann nicht entfernt werden.' };
    }

    const { error } = await adminSupabase
      .from('client_memberships')
      .delete()
      .eq('client_id', clientId)
      .eq('user_id', userId);

    if (error) return { error: `Fehler beim Entfernen: ${error.message}` };

    revalidatePath(`/kanzlei/mandant/${clientId}`);
    return { error: null };

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { error: `Unerwarteter Fehler: ${msg}` };
  }
}
