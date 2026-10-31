import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Die Zeitzone wird bewusst festgenagelt. Die Anwendung rechnet mit
// österreichischen Kalendertagen (Monats- und Quartalsgrenzen der UVA);
// ein Testlauf unter UTC – wie in der CI üblich – würde genau die
// Datumsfehler übersehen, die hier abgesichert werden sollen.
process.env.TZ = 'Europe/Vienna';

export default defineConfig({
  test: {
    // Nur echte Unit-Tests. Die Logik in src/lib ist bewusst frei von
    // React und Supabase, damit sie ohne Umgebung testbar bleibt.
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
  resolve: {
    // fileURLToPath statt .pathname: sonst wird ein Leerzeichen im Pfad
    // („Smart book keeping“) zu %20 und der Alias läuft ins Leere
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
});
