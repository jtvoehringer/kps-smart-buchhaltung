// ESLint 9 (Flat Config) mit eslint-config-next 16: die Pakete liefern
// die Flat-Konfiguration direkt – FlatCompat aus @eslint/eslintrc ist
// dafür nicht mehr nötig (und brach mit v16: "Oops! Something went wrong").
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const eslintConfig = [
  ...nextVitals,
  ...nextTs,
  {
    ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts', '_to_delete/**'],
  },
];

export default eslintConfig;
