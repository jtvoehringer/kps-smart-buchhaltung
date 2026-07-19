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
    <div className="min-h-screen flex items-center justify-center bg-[#E3F2FD]">
      <div className="bg-white rounded-xl shadow-lg p-8 w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="inline-block bg-[#1B3A6B] text-white text-sm font-bold px-3 py-1 rounded mb-3">KPS</div>
          <h1 className="text-2xl font-bold text-[#1B3A6B]">Passwort zurücksetzen</h1>
          <p className="text-gray-500 text-sm mt-1">Wir senden dir einen Reset-Link per E-Mail</p>
        </div>

        {sent ? (
          <div className="text-center space-y-4">
            <div className="text-4xl">📧</div>
            <p className="text-gray-700 font-medium">E-Mail gesendet!</p>
            <p className="text-sm text-gray-500">
              Schau in dein Postfach bei <strong>{email}</strong> und klicke auf den Link.
            </p>
            <Link href="/login" className="block text-sm text-[#1B3A6B] hover:underline mt-4">
              ← Zurück zum Login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">E-Mail-Adresse</label>
              <input
                type="email" name="email" required autoComplete="email"
                value={email} onChange={e => setEmail(e.target.value)}
                placeholder="max@mustermann.at"
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]"
              />
            </div>
            {error && <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
            <button type="submit" disabled={loading}
              className="w-full bg-[#1B3A6B] hover:bg-[#1565C0] text-white font-semibold py-2.5 rounded-lg transition-colors disabled:opacity-50">
              {loading ? 'Senden…' : 'Reset-Link senden'}
            </button>
            <Link href="/login" className="block text-center text-sm text-gray-400 hover:text-gray-600">
              ← Zurück zum Login
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}
