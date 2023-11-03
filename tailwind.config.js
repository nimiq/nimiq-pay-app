/** @type {import('tailwindcss').Config} */
export default {
  content: ['index.html', './src/**/*.{vue,ts}'],
  theme: {
    extend: {
      ...require('tailwindcss-nimiq-theme'),
      boxShadow: {
        card: '0px 0.33701px 2px 0px rgba(0, 0, 0, 0.03), 0px 1.5px 3px 0px rgba(0, 0, 0, 0.05), 0px 4px 16px 0px rgba(0, 0, 0, 0.07);',
      },
    },
  },
  plugins: [
    function ({ addComponents }) {
      addComponents({
        '.hide-scrollbar': {
          '&::-webkit-scrollbar': {
            width: '0',
            height: '0',
            display: 'none',
          } /* WebKit */,
        },
      })
    },
  ],
}
