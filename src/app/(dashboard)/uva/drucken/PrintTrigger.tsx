'use client';

import { useEffect } from 'react';

export default function PrintTrigger() {
  useEffect(() => {
    // Kurze Verzögerung damit Seite vollständig gerendert ist
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, []);
  return null;
}
