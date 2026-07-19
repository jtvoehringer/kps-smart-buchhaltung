'use client';

import { useState, useTransition } from 'react';
import { createBenutzer, updateBenutzerRole } from './actions';

type Benutzer = {
  id: string;
  email: string;
  fullName: string;
  role: string;
  lastLogin: string | null;
  tenantName?: string;
};

const ROLLE_LABEL: Record<string, string> = {
  superadmin: 'Superadmin',
  admin:      'Administrator',
  kanzlei:    'Kanzlei',
  klient:     'Klient',
};

const ROLLE_COLOR: Record<string, string> = {
  superadmin: 'bg-amber-100 text-amber-700',
  admin:      'bg-purple-100 text-purple-700',
  kanzlei:    'bg-blue-100 text-blue-700',
  klient:     'bg-gray-100 text-gray-600',
};

export default function BenutzerClient({
  users: initial,
  myRole,
  myId,
}: {
  users: Benutzer[];
  myRole: string;
  myId: string;
}) {
  const [users, setUsers]           = useState<Benutzer[]>(initial);
  const [email, setEmail]           = useState('');
  const [fullName, setFullName]     = useState('');
  const [role, setRole]             = useState('kanzlei');
  const [formError, setFormError]   = useState('');
  const [formSuccess, setFormSuccess] = useState('');
  const [tableError, setTableError] = useState('');
  const [isPending, startTransition] = useTransition();

  const isSuperadmin = myRole === 'superadmin';
  const showTenantCol = isSuperadmin;

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');
    const fd = new FormData();
    fd.set('email',     email);
    fd.set('full_name', fullName);
    fd.set('role',      role);
    startTransition(async () => {
      const res = await createBenutzer(fd);
      if (res.error) {
        setFormError(res.error);
      } else {
        setFormSuccess(`${email} wurde eingeladen.`);
        setEmail('');
        setFullName('');
        setRole('kanzlei');
        window.location.reload();
      }
    });
  }

  function handleRoleChange(userId: string, newRole: string) {
    setTableError('');
    startTransition(async () => {
      const res = await updateBenutzerRole(userId, newRole);
      if (res.error) {
        setTableError(res.error);
      } else {
        setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
      }
    });
  }

  // Rollen die im Dropdown erscheinen dürfen
  const editableRoles = isSuperadmin
    ? ['klient', 'kanzlei', 'admin', 'superadmin']
    : ['klient', 'kanzlei'];

  const createRoles = isSuperadmin
    ? ['kanzlei', 'klient', 'admin', 'superadmin']
    : myRole === 'admin'
    ? ['kanzlei', 'klient']
    : ['kanzlei', 'klient'];

  return (
    <div className="space-y-6">
      {/* Benutzertabelle */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">Alle Benutzer ({users.length})</h2>
        </div>

        {tableError && (
          <div className="mx-5 mt-4 mb-2 text-red-600 text-sm bg-red-50 px-3 py-2 rounded-lg">
            {tableError}
          </div>
        )}

        {users.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">Keine Benutzer gefunden</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide border-b border-gray-100">
                  <th className="text-left px-6 py-3">Name / E-Mail</th>
                  {showTenantCol && <th className="text-left px-4 py-3">Tenant</th>}
                  <th className="text-left px-4 py-3">Rolle</th>
                  <th className="text-left px-4 py-3">Letzter Login</th>
                  <th className="text-center px-4 py-3">Rolle ändern</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => {
                  const isSelf = u.id === myId;
                  const isProtected = u.role === 'superadmin' && !isSuperadmin;
                  const canEdit = !isProtected && !isSelf;

                  return (
                    <tr key={u.id} className={`border-t border-gray-50 hover:bg-gray-50/50 ${isSelf ? 'bg-amber-50/30' : ''}`}>
                      <td className="px-6 py-3">
                        <div className="font-medium text-gray-800 flex items-center gap-1.5">
                          {u.fullName || u.email}
                          {isSelf && <span className="text-[10px] text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-full font-medium">Ich</span>}
                        </div>
                        {u.fullName && <div className="text-xs text-gray-400">{u.email}</div>}
                      </td>
                      {showTenantCol && (
                        <td className="px-4 py-3 text-xs text-gray-400">{u.tenantName ?? '—'}</td>
                      )}
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLLE_COLOR[u.role] ?? 'bg-gray-100 text-gray-500'}`}>
                          {ROLLE_LABEL[u.role] ?? u.role}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs">
                        {u.lastLogin
                          ? new Date(u.lastLogin).toLocaleDateString('de-AT', {
                              day: '2-digit', month: '2-digit', year: 'numeric',
                              hour: '2-digit', minute: '2-digit',
                            })
                          : 'Noch nie'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {canEdit ? (
                          <select
                            value={u.role}
                            onChange={e => handleRoleChange(u.id, e.target.value)}
                            disabled={isPending}
                            className="text-xs border border-gray-200 rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#1B3A6B] disabled:opacity-50"
                          >
                            {editableRoles.map(r => (
                              <option key={r} value={r}>{ROLLE_LABEL[r]}</option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-xs text-gray-300">
                            {isSelf ? '(eigene Rolle)' : '🔒'}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Neuen Benutzer anlegen */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <h2 className="font-semibold text-gray-800 mb-4">Neuen Benutzer einladen</h2>
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                E-Mail <span className="text-red-400">*</span>
              </label>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                required placeholder="name@beispiel.at"
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input
                type="text" value={fullName} onChange={e => setFullName(e.target.value)}
                placeholder="Vorname Nachname"
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Rolle <span className="text-red-400">*</span>
              </label>
              <select
                value={role} onChange={e => setRole(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]"
              >
                <option value="kanzlei">Kanzlei (Mitarbeiter)</option>
                <option value="klient">Klient (nur Dashboard)</option>
                {['admin', 'superadmin'].includes(myRole) && (
                  <option value="admin">Administrator</option>
                )}
                {isSuperadmin && (
                  <option value="superadmin">Superadmin</option>
                )}
              </select>
            </div>
          </div>

          <div className="bg-blue-50 text-blue-700 text-sm px-4 py-3 rounded-lg">
            📧 Der Benutzer erhält eine Einladungs-E-Mail und kann sich damit ein Passwort setzen.
          </div>

          {formError   && <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-lg">{formError}</p>}
          {formSuccess && <p className="text-green-700 text-sm bg-green-50 px-3 py-2 rounded-lg">{formSuccess}</p>}

          <button
            type="submit" disabled={isPending}
            className="w-full py-2.5 rounded-lg text-sm font-semibold text-white bg-[#1B3A6B] hover:bg-[#1565C0] transition-colors disabled:opacity-50"
          >
            {isPending ? 'Einladen…' : '✉️ Benutzer einladen'}
          </button>
        </form>
      </div>
    </div>
  );
}
