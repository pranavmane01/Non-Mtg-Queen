/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      boxShadow: {
        glow: '0 0 28px rgba(16, 185, 129, 0.2)',
      },
    },
  },
  plugins: [],
}
