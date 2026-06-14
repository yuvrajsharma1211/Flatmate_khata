/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        darkbg: 'var(--darkbg)',
        darksurface: 'var(--darksurface)',
        paper: {
          DEFAULT: '#0b0f17',
          line: 'rgba(255, 255, 255, 0.10)'
        },
        ink: {
          DEFAULT: '#f8fafc',
          muted: '#94a3b8'
        },
        teal: {
          DEFAULT: '#c4b5fd',
          soft: 'rgba(139, 92, 246, 0.14)'
        },
        sage: '#86efac',
        rust: '#fb7185',
        gold: '#fbbf24',
        brand: {
          50: 'var(--brand-50)',
          100: 'var(--brand-100)',
          200: 'var(--brand-200)',
          300: 'var(--brand-300)',
          400: 'var(--brand-400)',
          500: 'var(--brand-500)',
          600: 'var(--brand-600)',
          700: 'var(--brand-700)',
          800: 'var(--brand-800)',
          900: 'var(--brand-900)',
        },
        accent: {
          50: 'var(--accent-50)',
          500: 'var(--accent-500)',
          600: 'var(--accent-600)',
        },
      },
      fontFamily: {
        heading: ['Outfit', 'sans-serif'],
        sans: ['Inter', 'sans-serif'],
      },
      boxShadow: {
        glass: '0 8px 32px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
      },
    },
  },
  plugins: [],
}
