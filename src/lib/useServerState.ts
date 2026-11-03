'use client';

import { useState } from 'react';

/**
 * Zustand, der vom Server kommt und dort auch aktualisiert werden kann.
 *
 * `useState(props.daten)` nimmt den Wert nur beim ersten Rendern. Kommen
 * über `router.refresh()` frische Daten vom Server, verwirft React sie
 * stillschweigend – die Komponente zeigt weiter ihren eigenen Stand.
 *
 * Sichtbar wird das dort, wo sich Daten auch ohne Zutun des Benutzers
 * ändern: die Belegerkennung läuft im Hintergrund und setzt den Status
 * eines Belegs von "wird verarbeitet" auf "erkannt". Der Server weiß
 * das nach dem Neuladen, die Oberfläche zeigt trotzdem weiter
 * "wird verarbeitet" – bis jemand die Seite komplett neu lädt.
 *
 * Dieser Hook übernimmt neue Serverdaten. Zwischenzeitliche lokale
 * Änderungen (etwa ein optimistisch gesetztes Häkchen) werden dabei
 * überschrieben – das ist beabsichtigt: der Server hat recht.
 */
export function useServerState<T>(vomServer: T) {
  const [wert, setWert] = useState<T>(vomServer);
  const [zuletzt, setZuletzt] = useState<T>(vomServer);

  // Abgleich direkt beim Rendern statt in useEffect: so zeigt schon der
  // erste Durchlauf die neuen Daten, ohne zusätzlichen Render mit dem
  // alten Stand (Muster aus der React-Doku „Storing information from
  // previous renders“).
  if (vomServer !== zuletzt) {
    setZuletzt(vomServer);
    setWert(vomServer);
  }

  return [wert, setWert] as const;
}
