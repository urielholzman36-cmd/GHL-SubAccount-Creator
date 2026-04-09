export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        magenta: '#ff00ff',
        navy: '#0B1120',
        'navy-light': '#111827',
        'navy-card': '#1a2332',
        sidebar: '#0d1526',
        'page-bg': '#0B1120',
        accent: {
          teal: '#2dd4bf',
          blue: '#3b82f6',
          purple: '#a855f7',
          magenta: '#ff00ff',
          orange: '#f97316',
        },
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'sans-serif'],
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg, #2dd4bf, #3b82f6, #a855f7, #ff00ff, #f97316)',
        'brand-gradient-r': 'linear-gradient(to right, #2dd4bf, #3b82f6, #a855f7, #ff00ff, #f97316)',
      },
    },
  },
  plugins: [],
};
