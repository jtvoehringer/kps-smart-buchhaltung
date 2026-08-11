import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Nur echte Unit-Tests. Die Steuerlogik in src/lib/steuer ist
    // bewusst frei von React und Supabase, damit sie ohne Umgebung
    // testbar bleibt.
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
  resolve: {
    alias: { '@': new URL('./src', import.meta.url).pathname },
  },
});
