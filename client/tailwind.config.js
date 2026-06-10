/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Instagram-ish palette
        primary: {
          DEFAULT: '#0095f6',
          hover: '#1877f2',
        },
        like: '#ff3040',
        surface: {
          light: '#ffffff',
          dark: '#000000',
        },
        elevated: {
          light: '#fafafa',
          dark: '#121212',
        },
        border: {
          light: '#dbdbdb',
          dark: '#262626',
        },
        muted: {
          light: '#737373',
          dark: '#a8a8a8',
        },
      },
      backgroundImage: {
        'story-ring': 'linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%)',
      },
      keyframes: {
        'heart-pop': {
          '0%': { transform: 'scale(0)', opacity: '0' },
          '15%': { transform: 'scale(1.25)', opacity: '0.9' },
          '30%': { transform: 'scale(0.95)' },
          '45%, 80%': { transform: 'scale(1)', opacity: '0.9' },
          '100%': { transform: 'scale(1)', opacity: '0' },
        },
        'like-bounce': {
          '0%': { transform: 'scale(1)' },
          '25%': { transform: 'scale(1.25)' },
          '50%': { transform: 'scale(0.9)' },
          '100%': { transform: 'scale(1)' },
        },
        marquee: {
          '0%': { transform: 'translateX(0%)' },
          '100%': { transform: 'translateX(-50%)' },
        },
      },
      animation: {
        'heart-pop': 'heart-pop 0.9s ease-in-out forwards',
        'like-bounce': 'like-bounce 0.35s ease-in-out',
        marquee: 'marquee 8s linear infinite',
      },
    },
  },
  plugins: [],
};
