/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{vue,js,ts,jsx,tsx}'
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace']
      },
      colors: {
        neon: {
          cyan: '#00f5ff',
          violet: '#bf5af2',
          green: '#32d74b',
          amber: '#ffd60a'
        }
      }
    }
  },
  plugins: []
}
