/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'robot-blue': '#4cc9f0',
        'robot-purple': '#7209b7',
        'robot-pink': '#f72585',
        'robot-green': '#4ade80',
      },
      fontFamily: {
        'comic': ['"Comic Sans MS"', '"Chalkboard SE"', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
