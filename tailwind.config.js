/** @type {import('tailwindcss').Config} */
export default {
  content: ['index.html', './src/**/*.{vue,ts}'],
  theme: {
    extend: {
      ...require('tailwindcss-nimiq-theme'),
      screens: {
        xs: '320px',
      },
      boxShadow: {
        card: '0px 0.33701px 2px 0px rgba(0, 0, 0, 0.03), 0px 1.5px 3px 0px rgba(0, 0, 0, 0.05), 0px 4px 16px 0px rgba(0, 0, 0, 0.07);',
      },
      keyframes: {
        slideDownAndFade: {
          from: { opacity: 0, transform: 'translateY(-4px)' },
          to: { opacity: 1, transform: 'translateY(0)' },
        },
        slideLeftAndFade: {
          from: { opacity: 0, transform: 'translateX(4px)' },
          to: { opacity: 1, transform: 'translateX(0)' },
        },
        slideUpAndFade: {
          from: { opacity: 0, transform: 'translateY(4px)' },
          to: { opacity: 1, transform: 'translateY(0)' },
        },
        slideRightAndFade: {
          from: { opacity: 0, transform: 'translateX(-4px)' },
          to: { opacity: 1, transform: 'translateX(0)' },
        },
        wiggle: {
          '0%, 100%': { transform: 'translateX(-5px)' },
          '50%': { transform: 'translateX(5px)' },
        },
      },
      animation: {
        slideDownAndFade: 'slideDownAndFade 250ms cubic-bezier(0.16, 1, 0.3, 1)',
        slideLeftAndFade: 'slideLeftAndFade 250ms cubic-bezier(0.16, 1, 0.3, 1)',
        slideUpAndFade: 'slideUpAndFade 250ms cubic-bezier(0.16, 1, 0.3, 1)',
        slideRightAndFade: 'slideRightAndFade 250ms cubic-bezier(0.16, 1, 0.3, 1)',
        wiggle: 'wiggle 250ms ease-in-out',
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
