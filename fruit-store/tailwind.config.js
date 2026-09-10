/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        store: {
          bg: '#fdf6e2',
          wood: '#8d5b4c',
          woodLight: '#c29b7f',
          counter: '#deb887',
        }
      },
      fontFamily: {
        cartoon: ['"Comic Sans MS"', '"Chalkboard SE"', 'cursive', 'sans-serif'],
      },
      animation: {
        'bounce-soft': 'bounce 1s infinite',
        'pulse-fast': 'pulse 0.7s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'wobble': 'wobble 0.5s ease-in-out',
      },
      keyframes: {
        wobble: {
          '0%, 100%': { transform: 'translateX(0)' },
          '20%, 60%': { transform: 'translateX(-8px) rotate(-4deg)' },
          '40%, 80%': { transform: 'translateX(8px) rotate(4deg)' },
        }
      }
    },
  },
  plugins: [],
}
