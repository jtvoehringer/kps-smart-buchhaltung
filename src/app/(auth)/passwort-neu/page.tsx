'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function PasswortNeuPage() {
  const router = useRouter();
  const supabase = createClient();
  const [password, setPassword]   = useState('');
  const [password2, setPassword2] = useState('');
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== password2) {
      setError('Die Passwörter stimmen nicht überein.');
      return;
    }
    if (password.length < 8) {
      setError('Das Passwort muss mindestens 8 Zeichen lang sein.');
      return;
    }
    setLoading(true);
    setError('');

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setError(`Fehler: ${error.message}`);
      setLoading(false);
    } else {
      window.location.href = '/dashboard';
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg px-4">
      <div className="card p-8 w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="inline-block bg-navy text-white text-sm font-bold px-3 py-1 rounded-sm mb-3">ICP</div>
          <h1 className="text-2xl font-semibold text-navy tracking-[-0.01em]">Neues Passwort</h1>
          <p className="text-ink-2 text-sm mt-1">Bitte wähle ein neues Passwort</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="page-0" className="block text-sm font-medium text-ink mb-1">Neues Passwort</label>
            <input id="page-0" type="password" name="new-password" required autoComplete="new-password"
              value={password} onChange={e => setPassword(e.target.value)}
              placeholder="Mindestens 8 Zeichen"
              className="w-full border border-line-2 rounded-lg px-4 py-2.5 text-sm focus:outline-hidden focus:border-signal focus:ring-2 focus:ring-signal/30" />
          </div>
          <div>
            <label htmlFor="page-1" className="block text-sm font-medium text-ink mb-1">Passwort bestätigen</label>
            <input id="page-1" type="password" name="confirm-password" required autoComplete="new-password"
              value={password2} onChange={e => setPassword2(e.target.value)}
              placeholder="Nochmals eingeben"
              className="w-full border border-line-2 rounded-lg px-4 py-2.5 text-sm focus:outline-hidden focus:border-signal focus:ring-2 focus:ring-signal/30" />
          </div>
          {error && <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full bg-navy hover:bg-navy-2 text-white font-semibold py-2.5 rounded-lg transition-colors disabled:opacity-50">
            {loading ? 'Speichern…' : 'Passwort speichern'}
          </button>
        </form>
      </div>
    </div>
  );
}
