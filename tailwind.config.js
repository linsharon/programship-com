/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      keyframes: {
        fadeIn: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        ping: {
          '75%, 100%': { transform: 'scale(2)', opacity: '0' },
        },
        soundwave: {
          '0%, 100%': { height: '20%' },
          '50%': { height: '100%' },
        },
      },
      animation: {
        fadeIn: 'fadeIn 0.5s ease-out forwards',
        soundwave: 'soundwave 0.8s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
