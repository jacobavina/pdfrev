/** @type {import('tailwindcss').Config} */

// Tema por variables CSS (ADR-0017): los tokens `cad-*` y la escala `gray` se resuelven en src/index.css
// según `data-theme` en <html> ("light" por defecto, "dark" opcional). La escala gray se invierte en el tema
// claro, de modo que los componentes diseñados como "texto claro sobre panel oscuro" mantienen el contraste.
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        cad: {
          dark: v('cad-dark'),
          panel: v('cad-panel'),
          subtle: v('cad-subtle'),
          border: v('cad-border'),
          accent: v('cad-accent'),
          hover: v('cad-hover'),
          canvas: v('cad-canvas'),
          strong: v('cad-strong'),
          ribbon: v('cad-ribbon'),
          status: v('cad-status'),
          field: v('cad-field'),
        },
        gray: {
          50: v('gray-50'),
          100: v('gray-100'),
          200: v('gray-200'),
          300: v('gray-300'),
          400: v('gray-400'),
          500: v('gray-500'),
          600: v('gray-600'),
          700: v('gray-700'),
          800: v('gray-800'),
          900: v('gray-900'),
        },
      },
    },
  },
  plugins: [],
};
