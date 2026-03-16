/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    // Required for pdfjs-dist in Next.js
    config.resolve.alias.canvas = false
    return config
  },
}

module.exports = nextConfig
