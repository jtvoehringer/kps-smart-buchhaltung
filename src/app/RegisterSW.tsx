'use client';

import { useEffect } from 'react';

// Registriert den Service Worker (Voraussetzung für "Zum Home-Bildschirm
// hinzufügen" auf Android/Chrome). Läuft nur im Browser, still fehlschlagend
// falls Service Worker nicht unterstützt werden (z.B. älterer Browser).
export default function RegisterSW() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);
  return null;
}
