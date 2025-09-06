/** @type {import('tailwindcss').Config} */
export default {
  // Tailwind CSS v4 uses a CSS-first configuration.
  // Keep this file minimal to support external builds (e.g., UI package).
  // Add plugins here if/when needed.
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: {
        '2xl': '1400px',
      },
    },
    fontFamily: {
      mono: ["'IBM Plex Mono'", 'monospace'],
    },
  },
  plugins: [],
};

