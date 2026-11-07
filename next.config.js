const pkg = require("./package.json");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  env: {
    // Surfaced by GET /api/v1/health so a deployment can be identified without git.
    APP_VERSION: pkg.version,
  },
};

module.exports = nextConfig;
