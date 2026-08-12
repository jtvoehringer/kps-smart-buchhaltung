// Kategorienverwaltung – /buchungen/kategorien
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import NeueKategorieForm from './NeueKategorieForm';
import { Tags, ArrowLeft, ArrowUpCircle, ArrowDownCircle, ShieldCheck } from 'lucide-react';
import type { Category } from '@/lib/supabase/database.types';

export default async function KategorienPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Rolle + Tenant prüfen
  const { data: me } = await supabase
    .from('users')
    .select('role, tenant_id, full_name')
    .eq('id', user.id)
    .maybeSingle();

  if (!me) redirect('/dashboard');

  const canManage = ['admin', 'kanzlei', 'superadmin'].includes(me.role);

  // Kategorien laden: System-Kategorien (tenant_id IS NULL) + eigene Kanzlei-Kategorien
  const { data: categories } = await supabase
    .from('categories')
    .select('*')
    .or(me.tenant_id ? `tenant_id.is.null,tenant_id.eq.${me.tenant_id}` : 'tenant_id.is.null')
    .order('type')
    .order('sort_order');

  const all = (categories ?? []) as Category[];
  const income  = all.filter(c => c.type === 'income');
  const expense = all.filter(c => c.type === 'expense');

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <Link
          href="/buchungen"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-brand transition-colors mb-3"
        >
          <ArrowLeft size={14} strokeWidth={2} />
          Zurück zu Buchungen
        </Link>
        <h1 className="text-2xl font-bold text-brand flex items-center gap-2">
          <Tags size={24} strokeWidth={1.75} className="text-accent-dark" />
          Kategorien
        </h1>
        <p className="text-gray-500 text-sm mt-0.5">
          Einnahmen- und Ausgabenkategorien für die Buchungserfassung
        </p>
      </div>

      {canManage && (
        <div className="mb-6">
          <NeueKategorieForm tenantId={me.tenant_id} />
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <KategorieListe
          title="Einnahmen"
          icon={<ArrowUpCircle size={18} strokeWidth={1.75} className="text-income" />}
          categories={income}
          accentClass="text-income"
        />
        <KategorieListe
          title="Ausgaben"
          icon={<ArrowDownCircle size={18} strokeWidth={1.75} className="text-expense" />}
          categories={expense}
          accentClass="text-expense"
        />
      </div>
    </div>
  );
}

function KategorieListe({
  title,
  icon,
  categories,
  accentClass,
}: {
  title: string;
  icon: React.ReactNode;
  categories: Category[];
  accentClass: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2 bg-gray-50">
        {icon}
        <h2 className={`font-semibold text-sm ${accentClass}`}>{title}</h2>
        <span className="ml-auto text-xs text-gray-400">{categories.length}</span>
      </div>
      {categories.length === 0 ? (
        <div className="text-center py-8 text-gray-400 text-sm">Keine Kategorien</div>
      ) : (
        <ul className="divide-y divide-gray-50">
          {categories.map(c => (
            <li key={c.id} className="px-4 py-2.5 flex items-center justify-between text-sm">
              <span className="text-gray-700 flex items-center gap-2">
                {c.name}
                {c.is_system && (
                  <span title="System-Kategorie">
                    <ShieldCheck size={13} strokeWidth={2} className="text-gray-300" />
                  </span>
                )}
              </span>
              <span className="flex items-center gap-3 text-xs text-gray-400">
                {c.konto_nr && <span>{c.konto_nr}</span>}
                <span className="font-medium">{c.vat_rate}%</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
