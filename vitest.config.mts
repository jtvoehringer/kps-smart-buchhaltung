import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    // Nur echte Unit-Tests. Die Steuerlogik in src/lib/steuer ist
    // bewusst frei von React und Supabase, damit sie ohne Umgebung
    // testbar bleibt.
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
});
