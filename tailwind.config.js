import { fontFamily } from 'tailwindcss/defaultTheme';
import tailwindcssAnimate from 'tailwindcss-animate';

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: {
        '2xl': '1400px',
      },
    },
    extend: {
      fontFamily: {
        mono: ['IBM Plex Mono', ...fontFamily.mono],
      },
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        sidebar: {
          DEFAULT: 'hsl(var(--sidebar))',
        },
        success: {
          DEFAULT: 'hsl(var(--success))',
          foreground: 'hsl(var(--success-foreground))',
        },
        cyan: {
          50: '#DDF1E4',
          100: '#BFE8D9',
          150: '#A2DECE',
          200: '#87D3C3',
          300: '#5ABDAC',
          400: '#3AA99F',
          500: '#2F968D',
          600: '#24837B',
          700: '#1C6C66',
          800: '#164F4A',
          850: '#143F3C',
          900: '#122F2C',
          950: '#101F1D',
        },
        green: {
          50: '#EDEECF',
          100: '#DDE2B2',
          150: '#CDD597',
          200: '#BEC97E',
          300: '#A0AF54',
          400: '#879A39',
          500: '#768D21',
          600: '#66800B',
          700: '#536907',
          800: '#3D4C07',
          850: '#313D07',
          900: '#252D09',
          950: '#1A1E0C',
        },
        red: {
          50: '#FFE1D5',
          100: '#FFCABB',
          150: '#FDB2A2',
          200: '#F89A8A',
          300: '#E8705F',
          400: '#D14D41',
          500: '#C03E35',
          600: '#AF3029',
          700: '#942822',
          800: '#6C201C',
          850: '#551B18',
          900: '#3E1715',
          950: '#261312',
        },
        orange: {
          50: '#FFE1D5',
          100: '#FFCABB',
          150: '#FDB2A2',
          200: '#F89A8A',
          300: '#E8705F',
          400: '#D14D41',
          500: '#C03E35',
          600: '#AF3029',
          700: '#942822',
          800: '#6C201C',
          850: '#551B18',
          900: '#3E1715',
          950: '#261312',
        },
        purple: {
          50: '#F0EAEC',
          100: '#E2D9E9',
          150: '#D3CAE6',
          200: '#C4B9E0',
          300: '#A699D0',
          400: '#8B7EC8',
          500: '#735EB5',
          600: '#5E409D',
          700: '#4F3685',
          800: '#3C2A62',
          850: '#31234E',
          900: '#261C39',
          950: '#1A1623',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
      gridTemplateColumns: {
        sidebar: '200px auto',
        'sidebar-collapsed': '70px auto',
      },
      width: {
        sidebar: '220px',
        'sidebar-collapsed': '70px',
      },
    },
  },
  plugins: [tailwindcssAnimate],
};
