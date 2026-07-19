'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';

export async function createMandant(formData: FormData) {
  const companyName = formData.get('company_name') as string;
  const email       = formData.get('email')        as string;
  const fullName    = formData.get('full_name')     as string;
  const uidNumber   = formData.get('uid_number')    as string;
  const vatPeriod   = formData.get('vat_period')    as string;

  if (!companyName || !email) {
    return { error: 'Firmenname und E-Mail sind Pflichtfelder.' };
  }

  const supabase      = await createClient();
  const adminSupabase = createAdminClient();

  // Rolle des eingeloggten Users prüfen
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Nicht eingeloggt.' };

  const { data: me } = await supabase
    .from('users')
    .select('role, tenant_id')
    .eq('id', user.id)
    .maybeSingle();

  if (!me || !['admin', 'kanzlei', 'superadmin'].includes(me.role)) {
    return { error: 'Keine Berechtigung.' };
  }

  // 1. Prüfen ob User bereits existiert
  const { data: existingUser } = await adminSupabase
    .from('users')
    .select('id')
    .eq('email', email)
    .maybeSingle();

  let mandantUserId: string;

  if (existingUser) {
    // User existiert bereits → direkt verwenden, kein Invite nötig
    mandantUserId = existingUser.id;
  } else {
    // Neuen User per Einladung anlegen
    const { data: inviteData, error: inviteError } = await adminSupabase.auth.admin.inviteUserByEmail(
      email,
      { data: { full_name: fullName } }
    );

    if (inviteError) {
      return { error: `Einladung fehlgeschlagen: ${inviteError.message}` };
    }

    mandantUserId = inviteData.user.id;

    // public.users Eintrag anlegen
    const { error: userError } = await adminSupabase
      .from('users')
      .insert({
        id:        mandantUserId,
        tenant_id: me.tenant_id,
        email,
        full_name: fullName || null,
        role:      'klient',
      });

    if (userError) {
      return { error: `User-Eintrag fehlgeschlagen: ${userError.message}` };
    }
  }

  // 2. Client-Eintrag anlegen
  const { data: newClient, error: clientError } = await adminSupabase
    .from('clients')
    .insert({
      tenant_id:    me.tenant_id,
      user_id:      mandantUserId,
      company_name: companyName,
      uid_number:   uidNumber || null,
      vat_period:   (vatPeriod || 'quarterly') as 'monthly' | 'quarterly',
    })
    .select('id')
    .single();

  if (clientError) {
    return { error: `Mandantenprofil fehlgeschlagen: ${clientError.message}` };
  }

  // 3. client_membership anlegen (User → Client-Zugriff)
  await adminSupabase
    .from('client_memberships')
    .insert({
      client_id:  newClient.id,
      user_id:    mandantUserId,
      invited_by: user.id,
    });

  redirect('/kanzlei');
}
