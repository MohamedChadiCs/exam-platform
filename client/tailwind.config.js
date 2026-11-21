/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['"Readex Pro"', 'system-ui', 'sans-serif'] },
      colors: {
        paper: '#F6F7FA',
        ink: { DEFAULT: '#14213D', soft: '#4A5675', faint: '#8A93AB' },
        mark: { DEFAULT: '#3346D3', dark: '#2636A8', tint: '#E8EBFC' },
        pen: { DEFAULT: '#C8312B', tint: '#FCEBEA' },
        danger: { DEFAULT: '#C8312B', tint: '#FCEBEA' },
        ok: { DEFAULT: '#1F7A4D', tint: '#E4F4EB' },
        line: '#DDE1EB',
      },
    },
  },
  plugins: [],
};
