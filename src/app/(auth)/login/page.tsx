// ============================================================
// Login-Seite  –  /login
// E-Mail + Passwort Login
// ============================================================
'use client';

import { useState } from 'react';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const supabase = createClient();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(`Fehler: ${error.message}`);
      setLoading(false);
    } else {
      // Vollständiger Browser-Redirect damit Cookies korrekt übertragen werden
      window.location.href = '/dashboard';
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg px-4">
      <div className="card p-8 w-full max-w-md">

        {/* Logo / Titel */}
        <div className="mb-8 text-center">
          <div className="flex justify-center mb-3">
            <Image src="/icp-lockup-navy.png" alt="ICP Solutions" width={170} height={50} priority />
          </div>
          <h1 className="text-2xl font-semibold text-navy tracking-[-0.01em]">E&amp;A Suite</h1>
          <p className="text-ink-2 text-sm mt-1">Bitte melden Sie sich an</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4" suppressHydrationWarning>
          <div>
            <label htmlFor="page-0" className="block text-sm font-medium text-ink mb-1">
              E-Mail-Adresse
            </label>
            <input id="page-0"
              type="email"
              name="email"
              required
              autoComplete="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="max@mustermann.at"
              className="w-full border border-line-2 rounded-lg px-4 py-2.5 text-sm focus:outline-hidden focus:border-signal focus:ring-2 focus:ring-signal/30"
              suppressHydrationWarning
            />
          </div>

          <div>
            <label htmlFor="page-1" className="block text-sm font-medium text-ink mb-1">
              Passwort
            </label>
            <input id="page-1"
              type="password"
              name="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full border border-line-2 rounded-lg px-4 py-2.5 text-sm focus:outline-hidden focus:border-signal focus:ring-2 focus:ring-signal/30"
              suppressHydrationWarning
            />
          </div>

          {error && (
            <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-lg">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-navy hover:bg-navy-2 text-white font-semibold py-2.5 rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? 'Anmelden…' : 'Anmelden'}
          </button>
        </form>

        <p className="text-center mt-4">
          <a href="/passwort-vergessen" className="text-xs text-ink-3 hover:text-navy">
            Passwort vergessen?
          </a>
        </p>
        <p className="text-center text-xs text-ink-3 mt-3">
          Bereitgestellt von ICP Solutions
        </p>
      </div>
    </div>
  );
}
