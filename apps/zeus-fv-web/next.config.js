const path = require("path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["maplibre-gl"],
  outputFileTracingRoot: path.join(__dirname),
};

module.exports = nextConfig;
