/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // ICP Corporate Design (Design-Review August 2026, Welle 2).
        // brand = Navy: Headlines, primäre Flächen, Beträge.
        brand: {
          DEFAULT: '#14355C',
          dark:    '#0E2540',   // Sidebar, gedrückte Zustände
          light:   '#45566B',   // Fließtext-Blau (CD)
        },
        // accent = Signal: DIE Aktionsfarbe. Läuft über eine CSS-Variable,
        // damit eine Kanzlei sie über branding.brand_color austauschen kann
        // (einzige austauschbare Größe neben dem Logo).
        accent: {
          DEFAULT: 'rgb(var(--signal-rgb) / <alpha-value>)',
          dark:    '#14355C',   // Hover/aktiv fällt auf Navy zurück
        },
        surface: {
          DEFAULT: '#F5F7F9',   // Fläche (CD)
          band:    '#E9F1F6',   // Hinweisboxen – Signal-Hauch
          card:    '#D9E2EA',
        },
        kontrast: '#17181A',
        muted:    '#8794A5',    // Labels (CD)
        // Design-Review M1: Beträge tragen keine Ampelfarben mehr.
        // Einnahme = Navy, Ausgabe = Fließtext-Blau; Rot bleibt Fehlern
        // und Überfälligem vorbehalten (dort via text-red-600 + Wort).
        income:  { DEFAULT: '#14355C', dark: '#0E2540' },
        expense: { DEFAULT: '#45566B', dark: '#314052' },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
};
