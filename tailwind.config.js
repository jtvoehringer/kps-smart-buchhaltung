/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#707883',
          dark:    '#3F454C',
          light:   '#AEB4BC',
        },
        accent: {
          DEFAULT: '#4F90E8',
          dark:    '#35609E',
        },
        surface: {
          DEFAULT: '#F6F7F9',
          band:    '#E7F0FC',
          card:    '#CFD9E6',
        },
      },
    },
  },
  plugins: [],
};
