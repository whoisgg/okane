/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // ── AppTheme exact match ──────────────────────────────────────
        bg:           '#F2F2F7',
        surface:      '#FFFFFF',
        'surface-high': '#F9FAFB',
        border:       '#E5E7EB',
        'border-subtle': '#F3F4F6',
        // Text
        'text-primary':   '#111827',
        'text-secondary': '#6B7280',
        'text-muted':     '#9CA3AF',
        // Accents
        accent:  '#4F46E5',
        success: '#10B981',
        danger:  '#F43F5E',
        warning: '#F59E0B',
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'SF Pro Display', 'Segoe UI', 'sans-serif'],
      },
      boxShadow: {
        card: '0 2px 8px 0 rgba(0,0,0,0.06)',
        'card-lg': '0 4px 16px 0 rgba(0,0,0,0.08)',
      },
      borderRadius: {
        xl: '16px',
        '2xl': '20px',
      },
    },
  },
  plugins: [],
}
