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
          'text-tertiary': 'var(--text-tertiary)',
          border: 'var(--border)',
          'accent-primary': 'var(--accent-primary)',
          'accent-secondary': 'var(--accent-secondary)',
          accent: 'var(--accent-primary)',
          'accent-hover': 'var(--accent-secondary)',
          'accent-tertiary': 'var(--accent-tertiary)',
          'chat-bg': 'var(--chat-bg)',
          'bubble-mine': 'var(--bubble-mine)',
          'bubble-other': 'var(--bubble-other)',
          elevated: 'var(--elevated)',
          highlight: 'var(--highlight)',
        },
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
        heading: ['"Space Grotesk"', '"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        glow: '0 18px 48px rgba(19, 31, 51, 0.18)',
      },
    },
  },
  plugins: [],
};
