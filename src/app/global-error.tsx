'use client';

// Letzte Instanz: greift, wenn der Fehler im Wurzel-Layout selbst
// auftritt. Diese Komponente ersetzt dann das gesamte Dokument und
// muss deshalb <html> und <body> selbst mitbringen. Sie kann keine
// Stile aus globals.css voraussetzen – daher alles inline.

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="de">
      <body style={{
        margin: 0, minHeight: '100vh', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        background: '#f6f7f9', color: '#1f2937',
        fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
      }}>
        <div style={{
          maxWidth: 520, padding: 32, background: '#fff',
          border: '1px solid #eceef1', borderRadius: 12,
        }}>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
            Die Anwendung konnte nicht geladen werden
          </h1>
          <p style={{ marginTop: 12, fontSize: 14, lineHeight: 1.6, color: '#4b5563' }}>
            Ihre Daten sind davon nicht betroffen. Bitte laden Sie die Seite neu.
            Bleibt der Fehler bestehen, melden Sie sich bitte mit der Kennung unten.
          </p>
          {error.digest && (
            <p style={{ marginTop: 12, fontSize: 12, color: '#9ca3af' }}>
              Kennung: <span style={{ fontFamily: 'monospace' }}>{error.digest}</span>
            </p>
          )}
          <button
            onClick={reset}
            style={{
              marginTop: 24, padding: '9px 18px', border: 0, borderRadius: 8,
              background: '#35609E', color: '#fff', fontSize: 14,
              fontWeight: 600, cursor: 'pointer',
            }}
          >
            Erneut versuchen
          </button>
        </div>
      </body>
    </html>
  );
}
