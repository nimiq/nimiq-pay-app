/** @type {import('tailwindcss').Config} */
export default {
  content: ['index.html', './src/**/*.{vue,ts}'],
  theme: {
    extend: {
      ...require('tailwindcss-nimiq-theme'),
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
