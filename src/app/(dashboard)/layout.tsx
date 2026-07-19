// Layout für alle Dashboard-Seiten
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Sidebar from './Sidebar';
import { getMyClientId } from '@/lib/supabase/get-my-client';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const clientId = await getMyClientId(supabase, user.id);
  const { data: client } = !clientId ? { data: null } : await supabase
    .from('clients')
    .select('company_name, modules_enabled')
    .eq('id', clientId)
    .maybeSingle();

  const { data: me } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  const modulesEnabled: string[] = (client as { modules_enabled?: string[] } | null)?.modules_enabled ?? [];

  return (
    <div className="h-screen flex overflow-hidden">
      <Sidebar
        companyName={client?.company_name ?? 'Smart Buchhaltung'}
        role={me?.role ?? 'klient'}
        modulesEnabled={modulesEnabled}
      />
      <main className="flex-1 overflow-y-auto bg-[#F8F8F3]">
        {children}
      </main>
    </div>
  );
}
