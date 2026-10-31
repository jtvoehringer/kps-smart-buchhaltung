// Akquise-Kennzahlen – /akquise/kennzahlen
// Platzhalter in Welle 9a; Funnel, Antwortquoten je Quelle/Vermittler und
// Durchlaufzeiten folgen in Welle 9b, sobald genug Aktivitäten erfasst sind.

import { Gauge } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import { Button, Card, Note } from '@/components/ui';

export default function KennzahlenPage() {
  return (
    <div className="px-6 py-7 max-w-6xl mx-auto">
      <PageHeader title="Akquise-Kennzahlen" subtitle="Welcher Kanal und welcher Vermittler bringen Rückmeldungen?" icon={Gauge} />
      <Card className="space-y-3">
        <Note>
          Die Kennzahlen kommen mit Welle 9b: Funnel je Stage (aus den Aktivitäten rekonstruiert), Antwortquote und
          mittlere Antwortzeit je Quelle und Vermittler, Durchlaufzeiten, gewichteter Pipeline-Wert über die Zeit und
          Verlustgründe. Dafür braucht es zuerst etwa zwei Wochen gepflegte Aktivitäten – bis dahin zeigt die Pipeline
          Antwortquote (30 Tage) und gewichteten Wert als Kacheln.
        </Note>
        <div className="flex gap-2">
          <Button href="/akquise">Zur Pipeline</Button>
          <Button href="/akquise/aktivitaeten" variant="ghost">Akquise-Journal</Button>
        </div>
      </Card>
    </div>
  );
}
