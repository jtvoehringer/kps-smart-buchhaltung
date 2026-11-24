import { Card, Note } from '@/components/ui';

/** Hinweis, wenn die Läufe nicht geladen werden konnten (z. B. Migration noch nicht eingespielt) */
export default function LadeHinweis({ grund, meldung }: { grund: 'tabelle-fehlt' | 'fehler'; meldung: string }) {
  return (
    <Card>
      {grund === 'tabelle-fehlt' ? (
        <Note tone="warn">
          Die Tabelle <span className="font-mono">healthcheck_laeufe</span> ist in der Datenbank noch nicht angelegt.
          Die Migration liegt als Entwurf unter <span className="font-mono">supabase/migrations_entwurf/</span>.
        </Note>
      ) : (
        <Note tone="crit">Die Prüfläufe konnten nicht geladen werden: {meldung}</Note>
      )}
    </Card>
  );
}
