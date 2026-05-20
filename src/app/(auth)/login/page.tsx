// ============================================================
// Login-Seite  –  /login
// Nutzt Supabase Magic Link (kein Passwort nötig für Klienten)
// ============================================================
'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const [email, setEmail]     = useState('');
  const [sent, setSent]       = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const supabase = createClient();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/dashboard`,
      },
    });

    if (error) {
      setError(error.message);
    } else {
      setSent(true);
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#E3F2FD]">
      <div className="bg-white rounded-xl shadow-lg p-8 w-full max-w-md">
        {/* Logo / Titel */}
        <div className="mb-8 text-center">
          <div className="inline-block bg-[#1B3A6B] text-white text-sm font-bold px-3 py-1 rounded mb-3">
            KPS
          </div>
          <h1 className="text-2xl font-bold text-[#1B3A6B]">Smart Buchhaltung</h1>
          <p className="text-gray-500 text-sm mt-1">Anmelden mit Ihrer E-Mail-Adresse</p>
        </div>

        {sent ? (
          <div className="text-center">
            <div className="text-4xl mb-4">📧</div>
            <h2 className="text-lg font-semibold text-gray-800 mb-2">Link gesendet!</h2>
            <p className="text-gray-500 text-sm">
              Bitte prüfen Sie Ihr E-Mail-Postfach (<strong>{email}</strong>)
              und klicken Sie auf den Login-Link.
            </p>
          </div>
        ) : (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                E-Mail-Adresse
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="max@mustermann.at"
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]"
              />
            </div>

            {error && (
              <p className="text-red-600 text-sm">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#1B3A6B] hover:bg-[#1565C0] text-white font-semibold py-2.5 rounded-lg transition-colors disabled:opacity-50"
            >
              {loading ? 'Wird gesendet…' : 'Login-Link anfordern'}
            </button>
          </form>
        )}

        <p className="text-center text-xs text-gray-400 mt-6">
          Bereitgestellt von IC&amp;P Consultants e.U.
        </p>
      </div>
    </div>
  );
}
