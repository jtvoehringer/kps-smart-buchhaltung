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
    <div className="min-h-screen flex items-center justify-center bg-[#E3F2FD]">
      <div className="bg-white rounded-xl shadow-lg p-8 w-full max-w-md">

        {/* Logo / Titel */}
        <div className="mb-8 text-center">
          <div className="flex justify-center mb-3">
            <Image src="/icp-lockup-navy.png" alt="ICP Solutions" width={170} height={50} priority />
          </div>
          <h1 className="text-2xl font-bold text-brand">Smart Buchhaltung</h1>
          <p className="text-gray-500 text-sm mt-1">Bitte melden Sie sich an</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4" suppressHydrationWarning>
          <div>
            <label htmlFor="page-0" className="block text-sm font-medium text-gray-700 mb-1">
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
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
              suppressHydrationWarning
            />
          </div>

          <div>
            <label htmlFor="page-1" className="block text-sm font-medium text-gray-700 mb-1">
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
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
              suppressHydrationWarning
            />
          </div>

          {error && (
            <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-lg">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand hover:bg-accent text-white font-semibold py-2.5 rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? 'Anmelden…' : 'Anmelden'}
          </button>
        </form>

        <p className="text-center mt-4">
          <a href="/passwort-vergessen" className="text-xs text-gray-400 hover:text-brand">
            Passwort vergessen?
          </a>
        </p>
        <p className="text-center text-xs text-gray-400 mt-3">
          Bereitgestellt von IC&amp;P Consultants e.U.
        </p>
      </div>
    </div>
  );
}
