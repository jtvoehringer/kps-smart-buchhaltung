'use client';

// Ansprechpersonen einer Firma (Welle 9a): Liste mit Bearbeiten/Löschen
// und Formular für neue Personen.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Mail, Phone } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { AcqPerson } from '@/lib/supabase/database.types';
import { Badge, Button, Card, CardHeader } from '@/components/ui';
import { inp, lbl } from '../../shared';

type PersonInput = { first_name: string; last_name: string; role: string; email: string; phone: string; linkedin_url: string; is_primary: boolean };
const LEER: PersonInput = { first_name: '', last_name: '', role: '', email: '', phone: '', linkedin_url: '', is_primary: false };

export default function Personen({ clientId, companyId, personen }: { clientId: string; companyId: string; personen: AcqPerson[] }) {
  const router = useRouter();
  const supabase = createClient();
  const [bearbeite, setBearbeite] = useState<string | 'neu' | null>(personen.length === 0 ? 'neu' : null);
  const [f, setF] = useState<PersonInput>(LEER);
  const [fehler, setFehler] = useState('');
  const [laeuft, setLaeuft] = useState(false);

  function oeffnen(p?: AcqPerson) {
    setFehler('');
    if (!p) { setF(LEER); setBearbeite('neu'); return; }
    setF({
      first_name: p.first_name ?? '', last_name: p.last_name ?? '', role: p.role ?? '', email: p.email ?? '',
      phone: p.phone ?? '', linkedin_url: p.linkedin_url ?? '', is_primary: p.is_primary,
    });
    setBearbeite(p.id);
  }

  async function speichern(e: React.FormEvent) {
    e.preventDefault();
    if (!f.first_name.trim() && !f.last_name.trim() && !f.email.trim()) { setFehler('Name oder E-Mail angeben.'); return; }
    setLaeuft(true); setFehler('');
    const payload = {
      client_id: clientId, company_id: companyId,
      first_name: f.first_name.trim() || null, last_name: f.last_name.trim() || null, role: f.role.trim() || null,
      email: f.email.trim() || null, phone: f.phone.trim() || null, linkedin_url: f.linkedin_url.trim() || null,
      is_primary: f.is_primary,
    };
    const { error } = bearbeite === 'neu'
      ? await supabase.from('acq_people').insert(payload)
      : await supabase.from('acq_people').update(payload).eq('id', bearbeite!);
    setLaeuft(false);
    if (error) { setFehler(error.message); return; }
    setBearbeite(null);
    router.refresh();
  }

  async function loeschen(id: string) {
    if (!confirm('Ansprechperson löschen?')) return;
    const { error } = await supabase.from('acq_people').delete().eq('id', id);
    if (error) { setFehler(error.message); return; }
    router.refresh();
  }

  return (
    <Card padded={false} className="lg:sticky lg:top-4">
      <CardHeader title="Ansprechpersonen" border>
        {bearbeite !== 'neu' && <Button size="sm" variant="ghost" onClick={() => oeffnen()}>+ Person</Button>}
      </CardHeader>
      <ul>
        {personen.map(p => (
          <li key={p.id} className="px-5 py-3 border-b border-line">
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-[13.5px] font-medium text-ink">
                  {[p.first_name, p.last_name].filter(Boolean).join(' ') || p.email}
                  {p.is_primary && <Badge tone="info" className="ml-2">Haupt</Badge>}
                </p>
                {p.role && <p className="text-[12px] text-ink-3">{p.role}</p>}
                <div className="flex flex-wrap gap-x-3 text-[12px] mt-1">
                  {p.email && <a href={`mailto:${p.email}`} className="inline-flex items-center gap-1 text-navy hover:underline"><Mail size={12} />{p.email}</a>}
                  {p.phone && <a href={`tel:${p.phone}`} className="inline-flex items-center gap-1 text-navy hover:underline"><Phone size={12} />{p.phone}</a>}
                  {p.linkedin_url && <a href={p.linkedin_url} target="_blank" rel="noreferrer" className="text-navy hover:underline">LinkedIn</a>}
                </div>
              </div>
              <button type="button" className="text-[12px] text-navy hover:underline" onClick={() => oeffnen(p)}>bearbeiten</button>
              <button type="button" className="text-[12px] text-ink-3 hover:text-crit" onClick={() => loeschen(p.id)}>löschen</button>
            </div>
          </li>
        ))}
      </ul>
      {bearbeite && (
        <form onSubmit={speichern} className="px-5 py-4 space-y-3 bg-row">
          <div className="grid grid-cols-2 gap-2">
            <div><label htmlFor="p-vn" className={lbl}>Vorname</label><input id="p-vn" className={inp} value={f.first_name} onChange={e => setF({ ...f, first_name: e.target.value })} /></div>
            <div><label htmlFor="p-nn" className={lbl}>Nachname</label><input id="p-nn" className={inp} value={f.last_name} onChange={e => setF({ ...f, last_name: e.target.value })} /></div>
          </div>
          <div><label htmlFor="p-rolle" className={lbl}>Rolle</label><input id="p-rolle" className={inp} value={f.role} onChange={e => setF({ ...f, role: e.target.value })} placeholder="Recruiter, Account Manager …" /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><label htmlFor="p-mail" className={lbl}>E-Mail</label><input id="p-mail" type="email" className={inp} value={f.email} onChange={e => setF({ ...f, email: e.target.value })} /></div>
            <div><label htmlFor="p-tel" className={lbl}>Telefon</label><input id="p-tel" className={inp} value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} /></div>
          </div>
          <div><label htmlFor="p-li" className={lbl}>LinkedIn</label><input id="p-li" type="url" className={inp} value={f.linkedin_url} onChange={e => setF({ ...f, linkedin_url: e.target.value })} /></div>
          <label className="flex items-center gap-2 text-[12.5px] text-ink-2">
            <input type="checkbox" checked={f.is_primary} onChange={e => setF({ ...f, is_primary: e.target.checked })} /> Hauptansprechperson
          </label>
          {fehler && <p className="text-crit text-sm bg-crit-bg px-3 py-2 rounded-lg">{fehler}</p>}
          <div className="flex gap-2">
            <Button size="sm" type="submit" disabled={laeuft}>{bearbeite === 'neu' ? 'Person anlegen' : 'Speichern'}</Button>
            <Button size="sm" variant="ghost" onClick={() => setBearbeite(null)}>Abbrechen</Button>
          </div>
        </form>
      )}
      {!bearbeite && fehler && <p className="text-crit text-sm px-5 py-2">{fehler}</p>}
    </Card>
  );
}
