'use client';

import { useState } from 'react';
import { Smartphone, Send, Loader2 } from 'lucide-react';

export default function AppEinladungCard({ defaultEmail }: { defaultEmail: string }) {
  const [email, setEmail]     = useState(defaultEmail);
  const [sending, setSending] = useState(false);
  const [msg, setMsg]         = useState('');

  async function handleSend() {
    if (!email.trim()) { setMsg('Bitte eine E-Mail-Adresse angeben.'); return; }
    setSending(true);
    setMsg('');
    try {
      const res  = await fetch('/api/app-einladung', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ to: email.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Fehler beim Versand');
      setMsg(`✓ Installationslink wurde an ${data.sentTo} gesendet. Falls nichts ankommt: bitte auch im Spam-/Werbeordner nachsehen.`);
    } catch (e: unknown) {
      setMsg(`${e instanceof Error ? e.message : 'Fehler beim Versand'}`);
    }
    setSending(false);
  }

  return (
    <div className="card p-6 space-y-4">
      <h2 className="text-[17px] font-semibold text-navy flex items-center gap-2">
        <Smartphone size={18} strokeWidth={1.75} className="text-navy" />
        Mobile App
      </h2>
      <p className="text-sm text-ink-2">
        Die E&amp;A Suite lässt sich auf dem Smartphone oder Tablet als App installieren – ideal, um
        Belege direkt unterwegs zu fotografieren. Schick dir (oder einem Mitarbeiter/Klienten) den
        Installationslink samt Kurzanleitung per E-Mail.
      </p>
      <p className="text-xs text-ink-3">
        Hinweis: Die E-Mail landet manchmal im Spam-/Werbeordner – bitte dort nachsehen, falls sie nicht ankommt.
      </p>
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="name@beispiel.at"
          className="flex-1 border border-line-2 rounded-lg px-4 py-2.5 text-sm focus:outline-hidden focus:border-signal focus:ring-2 focus:ring-signal/30"
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={sending}
          className="inline-flex items-center justify-center gap-2 bg-navy hover:bg-navy-2 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors disabled:opacity-50"
        >
          {sending ? <Loader2 size={15} strokeWidth={2} className="animate-spin" /> : <Send size={15} strokeWidth={2} />}
          Link senden
        </button>
      </div>
      {msg && (
        <p className={`text-sm px-3 py-2 rounded-lg ${msg.startsWith('✓') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {msg}
        </p>
      )}
    </div>
  );
}
