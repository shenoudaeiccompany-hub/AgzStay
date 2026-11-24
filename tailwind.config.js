/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        offwhite: '#FAF9F6',
        charcoal: '#1F2937',
        navy: '#1E3A5F',
        warmSand: '#C5A880',
        primary: {
          50: '#F1F5F9',
          100: '#E2E8F0',
          200: '#CBD5E1',
          300: '#94A3B8',
          400: '#4B6B94',
          500: '#2A4D7A',
          600: '#1E3A5F',
          700: '#172E4D',
          800: '#112238',
          900: '#0B1626',
        },
        secondary: {
          50: '#FAF6F0',
          100: '#F3EBDE',
          200: '#E5D5BC',
          300: '#D6BF9A',
          400: '#CCB18A',
          500: '#C5A880',
          600: '#A88C64',
          700: '#8A714E',
          900: '#5C4A31',
        },
        sand: {
          50: '#FAF9F6',
          100: '#F4F1EA',
          200: '#E8E2D5',
          300: '#C5A880',
        },
        accent: {
          50: '#FAF6F0',
          100: '#F3EBDE',
          200: '#E5D5BC',
          300: '#D6BF9A',
          400: '#C5A880',
          500: '#C5A880',
          600: '#A88C64',
          700: '#8A714E',
        },
        success: {
          50: '#ECFDF5',
          500: '#10B981',
          700: '#047857',
        },
        warning: {
          50: '#FFFBEB',
          500: '#F59E0B',
          700: '#B45309',
        },
        error: {
          50: '#FEF2F2',
          500: '#EF4444',
          700: '#B91C1C',
        },
      },
      fontFamily: {
        sans: ['IBM Plex Sans Arabic', 'Cairo', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        xs: '0 1px 2px 0 rgba(31, 41, 55, 0.04)',
      },
    },
  },
  plugins: [],
};
