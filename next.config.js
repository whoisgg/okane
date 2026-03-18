/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required for pdfjs-dist — canvas must be aliased to false
  webpack: (config) => {
    config.resolve.alias.canvas = false
    return config
  },
  // Turbopack equivalent (Next.js 16+ uses Turbopack by default)
  turbopack: {
    resolveAlias: {
      canvas: './canvas-mock.js',
    },
  },
}

module.exports = nextConfig
