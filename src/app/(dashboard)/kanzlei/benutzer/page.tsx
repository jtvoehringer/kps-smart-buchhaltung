// Benutzerverwaltung – /kanzlei/benutzer
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import BenutzerClient from './BenutzerClient';

export default async function BenutzerPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: me } = await supabase
    .from('users')
    .select('role, tenant_id')
    .eq('id', user.id)
    .maybeSingle();

  if (!me || !['admin', 'kanzlei', 'superadmin'].includes(me.role)) {
    redirect('/dashboard');
  }

  const isSuperadmin = me.role === 'superadmin';

  // Benutzer laden – Superadmin sieht alle Tenants, andere nur den eigenen
  let userQ = supabase
    .from('users')
    .select(isSuperadmin
      ? 'id, email, full_name, role, last_login, tenant_id, tenants(name)'
      : 'id, email, full_name, role, last_login, tenant_id'
    )
    .order('role')
    .order('email');

  if (!isSuperadmin) {
    userQ = userQ.eq('tenant_id', me.tenant_id);
  }

  const { data: users } = await userQ;

  const mapped = (users ?? []).map((u: any) => ({
    id:         u.id,
    email:      u.email ?? '',
    fullName:   u.full_name ?? '',
    role:       u.role ?? 'klient',
    lastLogin:  u.last_login ?? null,
    tenantName: isSuperadmin
      ? (Array.isArray(u.tenants)
          ? (u.tenants[0] as { name?: string } | null)?.name
          : (u.tenants as { name?: string } | null)?.name) ?? '—'
      : undefined,
  }));

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6 flex items-center gap-2">
        <Link href="/kanzlei" className="text-gray-400 hover:text-gray-600 text-sm transition-colors">
          ← Kanzlei
        </Link>
        <span className="text-gray-300">/</span>
        <h1 className="text-2xl font-bold text-[#1B3A6B]">Benutzerverwaltung</h1>
      </div>

      <BenutzerClient users={mapped} myRole={me.role} myId={user.id} />
    </div>
  );
}
