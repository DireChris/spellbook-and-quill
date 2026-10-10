/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/**/*.{html,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { 950: '#0b0c10', 900: '#111319', 850: '#151821', 800: '#1b1f29', 700: '#292e3b' },
        parchment: '#e8dfc8',
        brass: { 300: '#e2c98a', 400: '#d3b46e', 500: '#ad8b48' },
        sage: '#91ad9b',
      },
      fontFamily: { display: ['Georgia', 'serif'], sans: ['Inter', 'Segoe UI', 'sans-serif'] },
      boxShadow: { 'soft-glow': '0 0 36px rgba(211, 180, 110, .07)' },
    },
  },
  plugins: [],
}
