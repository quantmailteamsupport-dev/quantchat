/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        qc: {
          bg: '#000000',
          surface: '#0A0A0A',
          elevated: '#141414',
          highlight: '#1E1E1E',
          accent: '#0066FF',
          'accent-hover': '#3385FF',
          'text-primary': '#FFFFFF',
          'text-secondary': '#8A8A8A',
          'text-tertiary': '#525252',
          border: '#262626',
          success: '#00FF66',
          error: '#FF3333',
        },
      },
      fontFamily: {
        sans: ['IBM Plex Sans', 'sans-serif'],
        heading: ['Cabinet Grotesk', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
};
