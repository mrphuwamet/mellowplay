/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Prompt', 'sans-serif'],
      },
      fontSize: {
        'xs': '15px',
        'sm': '15px',
        'base': '17px',
        'lg': '19px',
        'xl': '21px',
        '2xl': '25px',
        '3xl': '31px',
        '4xl': '37px',
        '5xl': '49px',
        '6xl': '61px',
      },
      fontWeight: {
        thin: '300',
        extralight: '300',
        light: '300',
        normal: '400',
        medium: '500',
        semibold: '500',
        bold: '500',
        extrabold: '500',
        black: '500',
      },
      colors: {
        'mellow-red': '#ef4f55',
        'mellow-red-soft': '#fff0f1',
        'mellow-yellow': '#f7aa16',
        'mellow-yellow-soft': '#fff7df',
        'mellow-blue': '#2273d9',
        'mellow-blue-soft': '#eef6ff',
        'mellow-purple': '#7452d6',
        'mellow-purple-soft': '#f4efff',
        'mellow-green': '#21a45b',
        'mellow-green-soft': '#effaf3',
        'mellow-orange': '#f6a800',
        'mellow-orange-soft': '#fff6df',
        'mellow-ink': '#172038',
        'mellow-muted': '#6c7280',
        'mellow-line': '#eef0f5',
        'mellow-bg': '#fbfaf7',
      },
      borderRadius: {
        'mellow': '24px',
        'mellow-btn': '18px',
      },
      boxShadow: {
        'mellow': '0 10px 30px rgba(22, 32, 56, 0.08)',
        'mellow-btn': '0 10px 22px rgba(239, 79, 85, 0.24)',
      },
    },
  },
  plugins: [],
}
