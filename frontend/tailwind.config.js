/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        qc: {
          bg: 'var(--bg)',
          surface: 'var(--surface)',
          'surface-hover': 'var(--surface-hover)',
          'text-primary': 'var(--text-primary)',
          'text-secondary': 'var(--text-secondary)',
          border: 'var(--border)',
          'accent-primary': 'var(--accent-primary)',
          'accent-secondary': 'var(--accent-secondary)',
          'chat-bg': 'var(--chat-bg)',
          'bubble-mine': 'var(--bubble-mine)',
          'bubble-other': 'var(--bubble-other)',
        },
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
      },
    },
  },
  plugins: [],
};