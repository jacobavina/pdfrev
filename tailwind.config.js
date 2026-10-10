/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        cad: {
          dark: '#1e2024',
          panel: '#282c34',
          subtle: '#32363e',
          border: '#3c4048',
          accent: '#007acc',
          hover: '#3a3f4b',
          canvas: '#16181b',
        }
      }
    },
  },
  plugins: [],
}
