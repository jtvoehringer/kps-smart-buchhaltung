// Layout für alle Dashboard-Seiten
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import AppShell from './AppShell';
import { getMyClientId } from '@/lib/supabase/get-my-client';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const clientId = await getMyClientId(supabase, user.id);
  const { data: client } = !clientId ? { data: null } : await supabase
    .from('clients')
    .select('company_name')
    .eq('id', clientId)
    .maybeSingle();

  const { data: me } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  // Welle 2: die einzige austauschbare Größe neben dem Logo ist die
  // Akzentfarbe der Kanzlei (branding.brand_color). Sie überschreibt
  // --signal-rgb, an der alle accent-Tokens hängen. Navy bleibt konstant.
  const { data: brandingFarbe } = !clientId ? { data: null } : await supabase
    .from('client_branding')
    .select('brand_color')
    .eq('client_id', clientId)
    .maybeSingle();

  const hex = brandingFarbe?.brand_color?.trim() ?? '';
  const signalRgb = /^#[0-9a-fA-F]{6}$/.test(hex)
    ? `${parseInt(hex.slice(1, 3), 16)} ${parseInt(hex.slice(3, 5), 16)} ${parseInt(hex.slice(5, 7), 16)}`
    : null;

  return (
    <div
      className="contents"
      style={signalRgb ? ({ ['--signal-rgb' as string]: signalRgb } as React.CSSProperties) : undefined}
    >
      <AppShell
        companyName={client?.company_name ?? 'Smart Buchhaltung'}
        role={me?.role ?? 'klient'}
      >
        {children}
      </AppShell>
    </div>
  );
}
