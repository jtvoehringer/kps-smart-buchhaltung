'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

export default function PasswortVergessenPage() {
  const supabase = createClient();
  const [email, setEmail]   = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent]     = useState(false);
  const [error, setError]   = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/passwort-neu`,
    });

    if (error) {
      setError(`Fehler: ${error.message}`);
    } else {
      setSent(true);
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg px-4">
      <div className="card p-8 w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="inline-block bg-navy text-white text-sm font-bold px-3 py-1 rounded-sm mb-3">ICP</div>
          <h1 className="text-2xl font-semibold text-navy tracking-[-0.01em]">Passwort zurücksetzen</h1>
          <p className="text-ink-2 text-sm mt-1">Wir senden dir einen Reset-Link per E-Mail</p>
        </div>

        {sent ? (
          <div className="text-center space-y-4">
            <div className="text-4xl"></div>
            <p className="text-ink font-medium">E-Mail gesendet!</p>
            <p className="text-sm text-ink-2">
              Schau in dein Postfach bei <strong>{email}</strong> und klicke auf den Link.
            </p>
            <Link href="/login" className="block text-sm text-navy hover:underline mt-4">
              ← Zurück zum Login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="page-0" className="block text-sm font-medium text-ink mb-1">E-Mail-Adresse</label>
              <input id="page-0"
                type="email" name="email" required autoComplete="email"
                value={email} onChange={e => setEmail(e.target.value)}
                placeholder="max@mustermann.at"
                className="w-full border border-line-2 rounded-lg px-4 py-2.5 text-sm focus:outline-hidden focus:border-signal focus:ring-2 focus:ring-signal/30"
              />
            </div>
            {error && <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
            <button type="submit" disabled={loading}
              className="w-full bg-navy hover:bg-navy-2 text-white font-semibold py-2.5 rounded-lg transition-colors disabled:opacity-50">
              {loading ? 'Senden…' : 'Reset-Link senden'}
            </button>
            <Link href="/login" className="block text-center text-sm text-ink-3 hover:text-navy">
              ← Zurück zum Login
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}
