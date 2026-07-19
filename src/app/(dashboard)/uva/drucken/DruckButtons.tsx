'use client';

import { useEffect } from 'react';

export default function DruckButtons() {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="no-print">
      <button className="btn-print" onClick={() => window.print()}>
        Drucken / Als PDF speichern
      </button>
      <button className="btn-close" onClick={() => window.close()}>
        Schließen
      </button>
    </div>
  );
}
