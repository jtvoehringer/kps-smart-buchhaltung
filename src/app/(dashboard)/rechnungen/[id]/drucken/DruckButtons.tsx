'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function DruckButtons({ invoiceId }: { invoiceId: string }) {
  useEffect(() => {
    // Kurz warten bis Bild geladen, dann Druckdialog öffnen
    const timer = setTimeout(() => window.print(), 800);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div style={{ display: 'flex', gap: '10px', alignItems: 'center', padding: '8px 16px', background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
      <button
        onClick={() => window.print()}
        style={{
          background: '#35609E', color: 'white', border: 'none', borderRadius: '8px',
          padding: '8px 18px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
        }}
      >
        🖨 Drucken / Als PDF speichern
      </button>
      <button
        onClick={() => window.close()}
        style={{
          background: 'none', border: '1px solid #d1d5db', borderRadius: '8px',
          padding: '8px 14px', fontSize: '13px', color: '#6b7280', cursor: 'pointer',
        }}
      >
        Schließen
      </button>
      <span style={{ fontSize: '11px', color: '#9ca3af', marginLeft: '8px' }}>
        Im Druckdialog „Als PDF speichern" wählen
      </span>
    </div>
  );
}
