'use client';

// Druckt den Bericht über den Browser-Dialog (dort auch "Als PDF speichern").
// Kopfleiste, Navigation und Knöpfe sind per print:hidden ausgeblendet.

import { Printer } from 'lucide-react';
import { Button } from '@/components/ui';

export default function DruckenKnopf() {
  return (
    <Button variant="secondary" onClick={() => window.print()} className="print:hidden">
      <Printer size={15} strokeWidth={1.75} />
      Drucken / PDF
    </Button>
  );
}
