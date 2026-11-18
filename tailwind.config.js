/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#EEF5F9',
          100: '#D4E6F0',
          200: '#A9CCE0',
          300: '#6FA9C9',
          400: '#347BA3',
          500: '#155A82',
          600: '#0B3954',
          700: '#092F46',
          800: '#072436',
          900: '#041825',
        },
        secondary: {
          50: '#EAF7F8',
          100: '#C9ECEF',
          200: '#97D9DF',
          500: '#087E8B',
          600: '#076A75',
          700: '#05535C',
          900: '#03353B',
        },
        sand: {
          50: '#FAF8F0',
          100: '#F4F1DE',
          200: '#EAE4C3',
          300: '#DDD39E',
        },
        accent: {
          50: '#FFF4E8',
          100: '#FFE4C2',
          200: '#FFCB85',
          300: '#FFAE47',
          400: '#FF9A1F',
          500: '#E07A2F',
          600: '#C4641E',
          700: '#9E4D14',
          800: '#78390E',
          900: '#522508',
        },
        success: {
          50: '#ECFDF3',
          500: '#16A34A',
          700: '#15803D',
        },
        warning: {
          50: '#FFFBEB',
          500: '#F59E0B',
          700: '#B45309',
        },
        error: {
          50: '#FEF2F2',
          500: '#DC2626',
          700: '#B91C1C',
        },
      },
      fontFamily: {
        sans: ['Cairo', 'Tajawal', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
