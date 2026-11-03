/** @type {import('next').NextConfig} */
// eslint-disable-next-line @typescript-eslint/no-require-imports -- CommonJS-Datei, require ist hier richtig
const pkg = require('./package.json');

const nextConfig = {
  // Österreichische Zeitzone für alle serverseitigen Datums-Operationen
  env: {
    TZ: 'Europe/Vienna',
    // Fußzeile der Sidebar: "Rel. <Version> – <Build>". Der Build ist der
    // Git-Commit, aus dem Vercel gebaut hat – hilft im Support, den
    // laufenden Stand eindeutig zuzuordnen. Lokal (ohne Vercel) leer.
    NEXT_PUBLIC_APP_VERSION: pkg.version,
    NEXT_PUBLIC_BUILD_SHA: (process.env.VERCEL_GIT_COMMIT_SHA ?? '').slice(0, 7),
  },
};

module.exports = nextConfig;
