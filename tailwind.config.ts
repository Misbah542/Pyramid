import type { Config } from 'tailwindcss';

/**
 * All colour values resolve to CSS custom properties declared in `src/index.css`,
 * so a single token set drives both the DOM and the WebGL scene.
 */
const token = (name: string) => `hsl(var(${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        base: token('--c-base'),
        surface: token('--c-surface'),
        elevated: token('--c-elevated'),
        overlay: token('--c-overlay'),
        line: token('--c-line'),
        'line-strong': token('--c-line-strong'),
        ink: token('--c-ink'),
        muted: token('--c-muted'),
        faint: token('--c-faint'),
        accent: token('--c-accent'),
        'accent-soft': token('--c-accent-soft'),
        positive: token('--c-positive'),
        warning: token('--c-warning'),
        danger: token('--c-danger'),
        node: {
          repository: token('--n-repository'),
          directory: token('--n-directory'),
          module: token('--n-module'),
          package: token('--n-package'),
          file: token('--n-file'),
          test: token('--n-test'),
          config: token('--n-config'),
          class: token('--n-class'),
          interface: token('--n-interface'),
          function: token('--n-function'),
          external: token('--n-external'),
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.01em' }],
      },
      borderRadius: {
        xs: 'var(--r-xs)',
        sm: 'var(--r-sm)',
        DEFAULT: 'var(--r-md)',
        md: 'var(--r-md)',
        lg: 'var(--r-lg)',
        xl: 'var(--r-xl)',
        '2xl': 'var(--r-2xl)',
      },
      boxShadow: {
        panel: 'var(--shadow-panel)',
        pop: 'var(--shadow-pop)',
        glow: 'var(--shadow-glow)',
      },
      spacing: {
        '4.5': '1.125rem',
        '13': '3.25rem',
        18: '4.5rem',
      },
      zIndex: {
        scene: '0',
        chrome: '10',
        panel: '20',
        overlay: '30',
        palette: '40',
        toast: '50',
      },
      transitionTimingFunction: {
        out: 'var(--ease-out)',
        spring: 'var(--ease-spring)',
      },
      transitionDuration: {
        fast: 'var(--t-fast)',
        base: 'var(--t-base)',
        slow: 'var(--t-slow)',
      },
      backgroundImage: {
        'grid-fade':
          'linear-gradient(to bottom, hsl(var(--c-base) / 0) 0%, hsl(var(--c-base) / 0.9) 70%, hsl(var(--c-base)) 100%)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.97)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        'pulse-ring': {
          '0%': { opacity: '0.7', transform: 'scale(0.8)' },
          '100%': { opacity: '0', transform: 'scale(1.6)' },
        },
        drift: {
          '0%,100%': { transform: 'translate3d(0,0,0)' },
          '50%': { transform: 'translate3d(0,-8px,0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in var(--t-base) var(--ease-out) both',
        'fade-up': 'fade-up var(--t-slow) var(--ease-out) both',
        'scale-in': 'scale-in var(--t-base) var(--ease-out) both',
        shimmer: 'shimmer 1.6s infinite',
        'pulse-ring': 'pulse-ring 1.8s var(--ease-out) infinite',
        drift: 'drift 9s ease-in-out infinite',
      },
    },
  },
  plugins: [],
} satisfies Config;
