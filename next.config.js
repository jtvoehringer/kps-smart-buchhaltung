/** @type {import('next').NextConfig} */
const nextConfig = {
  // Österreichische Zeitzone für alle serverseitigen Datums-Operationen
  env: {
    TZ: 'Europe/Vienna',
  },
};

module.exports = nextConfig;
