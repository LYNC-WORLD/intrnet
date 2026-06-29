/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#0A0A0B',
          900: '#0E0E0F',
          800: '#161617',
          700: '#1C1C1F',
          600: '#232326',
          500: '#2A2A2D',
          400: '#3A3A3E',
        },
        bone: {
          100: '#F5F5F0',
          300: '#C9C9C4',
          500: '#8B8B8F',
          700: '#5C5C60',
        },
        lime: {
          400: '#EEFB8C',
          500: '#E4F95E',
          600: '#C8DB3F',
          900: '#3A3F0E',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['"Space Grotesk"', 'Inter', 'ui-sans-serif', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.25rem',
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(228,249,94,0.15), 0 0 24px rgba(228,249,94,0.08)',
      },
      backgroundImage: {
        'grid-fade': 'radial-gradient(circle at 30% 20%, rgba(228,249,94,0.06), transparent 60%)',
      },
      keyframes: {
        'spin-slow': { to: { transform: 'rotate(360deg)' } },
        'fade-up': { from: { opacity: 0, transform: 'translateY(6px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
      },
      animation: {
        'spin-slow': 'spin-slow 6s linear infinite',
        'fade-up': 'fade-up 0.35s ease-out',
      },
    },
  },
  plugins: [],
}
