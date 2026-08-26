'use client';

import { useState, useTransition } from 'react';
import { useServerState } from '@/lib/useServerState';
import { addUserToMandant, removeUserFromMandant } from './actions';

type Member = { userId: string; email: string; fullName: string };

export default function MandantUserManager({
  clientId,
  members: initial,
}: {
  clientId: string;
  members: Member[];
}) {
  const [members, setMembers] = useServerState<Member[]>(initial);
  const [email, setEmail]     = useState('');
  const [error, setError]     = useState('');
  const [success, setSuccess] = useState('');
  const [isPending, startTransition] = useTransition();

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!email.trim()) return;

    startTransition(async () => {
      const res = await addUserToMandant(clientId, email.trim());
      if (res.error) {
        setError(res.error);
      } else {
        setSuccess(`${email.trim()} wurde hinzugefügt und erhält eine Einladungs-E-Mail.`);
        setEmail('');
        // Seite neu laden, damit der neue User in der Liste erscheint
        window.location.reload();
      }
    });
  }

  function handleRemove(userId: string, userEmail: string) {
    setError('');
    setSuccess('');
    startTransition(async () => {
      const res = await removeUserFromMandant(clientId, userId);
      if (res.error) {
        setError(res.error);
      } else {
        setMembers(prev => prev.filter(m => m.userId !== userId));
        setSuccess(`${userEmail} wurde entfernt.`);
      }
    });
  }

  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-4 border-b border-line">
        <h2 className="font-semibold text-ink">Benutzer ({members.length})</h2>
        <p className="text-xs text-ink-3 mt-0.5">
          Alle Benutzer mit Zugriff auf diesen Mandanten
        </p>
      </div>

      {/* Mitgliederliste */}
      {members.length === 0 ? (
        <div className="px-5 py-8 text-center text-ink-3 text-sm">
          Noch keine Benutzer zugewiesen
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {members.map(m => (
            <li key={m.userId} className="flex items-center justify-between px-5 py-3">
              <div>
                <div className="text-sm font-medium text-ink">
                  {m.fullName || m.email}
                </div>
                {m.fullName && (
                  <div className="text-xs text-ink-3">{m.email}</div>
                )}
              </div>
              <button
                onClick={() => handleRemove(m.userId, m.email)}
                disabled={isPending}
                className="text-xs text-red-500 hover:text-red-700 hover:bg-red-50 px-2.5 py-1 rounded-lg transition-colors disabled:opacity-40"
              >
                Entfernen
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Fehlermeldung / Erfolg */}
      {error && (
        <div className="mx-5 mt-3 text-red-600 text-sm bg-red-50 px-3 py-2 rounded-lg">
          {error}
        </div>
      )}
      {success && (
        <div className="mx-5 mt-3 text-green-700 text-sm bg-green-50 px-3 py-2 rounded-lg">
          {success}
        </div>
      )}

      {/* Benutzer hinzufügen */}
      <div className="px-5 py-4 border-t border-line bg-row/50">
        <h3 className="text-sm font-medium text-ink mb-3">Benutzer hinzufügen</h3>
        <form onSubmit={handleAdd} className="flex gap-2">
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="benutzer@beispiel.at"
            required
            disabled={isPending}
            className="flex-1 border border-line-2 rounded-lg px-3 py-2 text-sm focus:outline-hidden focus:border-signal focus:ring-2 focus:ring-signal/30 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={isPending || !email.trim()}
            className="px-4 py-2 bg-navy hover:bg-navy-2 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {isPending ? 'Hinzufügen…' : 'Hinzufügen'}
          </button>
        </form>
        <p className="text-xs text-ink-3 mt-2">
          Neue Benutzer erhalten automatisch eine Einladungs-E-Mail.
          Bereits registrierte Benutzer erhalten sofort Zugriff.
        </p>
      </div>
    </div>
  );
}
