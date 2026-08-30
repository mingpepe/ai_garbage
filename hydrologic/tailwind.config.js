/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ocean: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
          800: '#075985',
          900: '#0c4a6e',
          950: '#082f49',
        },
        slate: {
          850: '#172033',
          950: '#0b0f19',
        }
      },
      animation: {
        'flow-fast': 'flowDash 1.2s linear infinite',
        'flow-medium': 'flowDash 2s linear infinite',
        'flow-reverse': 'flowDashReverse 1.2s linear infinite',
        'spin-slow': 'spin 4s linear infinite',
        'spin-fast': 'spin 1s linear infinite',
        'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
        'float': 'floatAnim 3s ease-in-out infinite',
        'bubble': 'bubbleRise 2s ease-in-out infinite',
      },
      keyframes: {
        flowDash: {
          '0%': { strokeDashoffset: '48' },
          '100%': { strokeDashoffset: '0' },
        },
        flowDashReverse: {
          '0%': { strokeDashoffset: '0' },
          '100%': { strokeDashoffset: '48' },
        },
        pulseGlow: {
          '0%, 100%': { opacity: '0.6', filter: 'drop-shadow(0 0 8px rgba(56, 189, 248, 0.5))' },
          '50%': { opacity: '1', filter: 'drop-shadow(0 0 16px rgba(56, 189, 248, 0.9))' },
        },
        floatAnim: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-6px)' },
        },
        bubbleRise: {
          '0%': { transform: 'translateY(0) scale(0.8)', opacity: '0.2' },
          '50%': { opacity: '0.8' },
          '100%': { transform: 'translateY(-20px) scale(1.2)', opacity: '0' },
        }
      }
    },
  },
  plugins: [],
}
