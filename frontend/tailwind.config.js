/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        qc: {
          bg: 'var(--bg)',
          surface: 'var(--surface)',
          'text-primary': 'var(--text-primary)',
          'text-secondary': 'var(--text-secondary)',
          border: 'var(--border)',
          'accent-primary': 'var(--accent-primary)',
          'accent-secondary': 'var(--accent-secondary)',
          'accent-tertiary': 'var(--accent-tertiary)',
        },
      },
      fontFamily: {
        heading: ['Cabinet Grotesk', 'sans-serif'],
        mono: ['IBM Plex Mono', 'monospace'],
      },
      boxShadow: {
        'brutal': '4px 4px 0px 0px var(--border)',
        'brutal-lg': '6px 6px 0px 0px var(--border)',
      }
    },
  },
  plugins: [],
};