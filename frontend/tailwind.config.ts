import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '1rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
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
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        success: {
          DEFAULT: 'hsl(var(--success))',
          foreground: 'hsl(var(--success-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        ar:   ['var(--font-ar)', '"Noto Sans Arabic"', 'Tahoma', 'Arial', 'sans-serif'],
      },
      boxShadow: {
        soft:   '0 1px 0 0 hsl(var(--border)), 0 1px 2px -1px hsl(var(--border))',
        elev:   '0 1px 0 0 hsl(var(--border)), 0 8px 24px -12px rgb(0 0 0 / 0.4)',
        glow:   '0 0 0 1px hsl(var(--ring) / 0.3), 0 8px 32px -8px hsl(var(--primary) / 0.35)',
      },
      keyframes: {
        'fade-in':    { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        'slide-up':   { '0%': { opacity: '0', transform: 'translateY(8px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        'pulse-dot':  { '0%,80%,100%': { opacity: '0.3' }, '40%': { opacity: '1' } },
        'shimmer':    { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
        'think':      {
          '0%, 100%': { transform: 'scale(0.7)',  opacity: '0.55' },
          '50%':      { transform: 'scale(1.15)', opacity: '1' },
        },
      },
      animation: {
        'fade-in':   'fade-in 200ms ease-out',
        'slide-up':  'slide-up 250ms cubic-bezier(0.16, 1, 0.3, 1)',
        'pulse-dot': 'pulse-dot 1.4s ease-in-out infinite',
        'shimmer':   'shimmer 1.8s linear infinite',
        'think':     'think 1.1s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
