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

export async function createBenutzer(formData: FormData) {
  const email    = formData.get('email')     as string;
  const fullName = formData.get('full_name') as string;
  const role     = formData.get('role')      as string;

  if (!email || !role) return { error: 'E-Mail und Rolle sind Pflichtfelder.' };
  if (!['klient', 'kanzlei', 'admin', 'superadmin'].includes(role)) {
    return { error: 'Ungültige Rolle.' };
  }

  const { error: authError, user, me } = await authorizeKanzlei();
  if (authError || !user || !me) return { error: authError };

  // Nur Superadmin darf weitere Superadmins anlegen
  if (role === 'superadmin' && me.role !== 'superadmin') {
    return { error: 'Nur Superadmins dürfen weitere Superadmins anlegen.' };
  }
  // Nur Admin oder Superadmin darf Admin-Rolle vergeben
  if (role === 'admin' && !['admin', 'superadmin'].includes(me.role)) {
    return { error: 'Nur Administratoren dürfen Admin-Benutzer anlegen.' };
  }

  const adminSupabase = createAdminClient();

  const { data: existingUser } = await adminSupabase
    .from('users')
    .select('id')
    .eq('email', email)
    .maybeSingle();

  if (existingUser) {
    return { error: 'Ein Benutzer mit dieser E-Mail-Adresse existiert bereits.' };
  }

  const { data: inviteData, error: inviteError } =
    await adminSupabase.auth.admin.inviteUserByEmail(email, {
      data: { full_name: fullName },
    });

  if (inviteError) {
    return { error: `Einladung fehlgeschlagen: ${inviteError.message}` };
  }

  const newUserId = inviteData.user.id;

  const { error: userError } = await adminSupabase
    .from('users')
    .insert({
      id:        newUserId,
      tenant_id: me.tenant_id,
      email,
      full_name: fullName || null,
      role: role as 'admin' | 'kanzlei' | 'klient' | 'superadmin', // oben bereits gegen erlaubte Werte geprüft
    });

  if (userError) {
    return { error: `Benutzer-Eintrag fehlgeschlagen: ${userError.message}` };
  }

  revalidatePath('/kanzlei/benutzer');
  return { error: null, success: true };
}

export async function updateBenutzerRole(userId: string, newRole: string) {
  if (!['klient', 'kanzlei', 'admin', 'superadmin'].includes(newRole)) {
    return { error: 'Ungültige Rolle.' };
  }

  const { error: authError, user, me } = await authorizeKanzlei();
  if (authError || !user || !me) return { error: authError };

  const adminSupabase = createAdminClient();

  // Zieluser laden – Superadmin-Schutz
  const { data: target } = await adminSupabase
    .from('users')
    .select('role')
    .eq('id', userId)
    .maybeSingle();

  if (target?.role === 'superadmin' && me.role !== 'superadmin') {
    return { error: 'Die Rolle eines Superadmins kann nicht geändert werden.' };
  }
  if (newRole === 'superadmin' && me.role !== 'superadmin') {
    return { error: 'Nur Superadmins dürfen die Superadmin-Rolle vergeben.' };
  }

  const { error } = await adminSupabase
    .from('users')
    .update({ role: newRole as 'admin' | 'kanzlei' | 'klient' | 'superadmin' }) // oben bereits gegen erlaubte Werte geprüft
    .eq('id', userId);

  if (error) return { error: `Rolle konnte nicht geändert werden: ${error.message}` };

  revalidatePath('/kanzlei/benutzer');
  return { error: null };
}
