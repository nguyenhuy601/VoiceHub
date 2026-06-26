/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      /* ─── Typography (Figma Enterprise — theme.css + fonts.css) ─── */
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        display: ['"Plus Jakarta Sans"', 'Inter', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        xs: ['0.75rem', { lineHeight: '1.5', letterSpacing: '0' }],
        sm: ['0.875rem', { lineHeight: '1.5', letterSpacing: '0' }],
        base: ['0.9375rem', { lineHeight: '1.5', letterSpacing: '0' }], // 15px — Figma --font-size
        lg: ['1.0625rem', { lineHeight: '1.4', letterSpacing: '-0.015em' }],
        xl: ['1.25rem', { lineHeight: '1.35', letterSpacing: '-0.02em' }],
        '2xl': ['1.5rem', { lineHeight: '1.3', letterSpacing: '-0.025em' }],
        '3xl': ['1.875rem', { lineHeight: '1.25', letterSpacing: '-0.03em' }],
      },
      fontWeight: {
        normal: '400',
        medium: '500',
        semibold: '600',
      },

      /* ─── Colors — map to CSS variables in index.css (Figma theme.css) ─── */
      colors: {
        border: 'var(--border)',
        'border-strong': 'var(--border-strong)',
        input: 'var(--input)',
        ring: 'var(--ring)',
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        'foreground-secondary': 'var(--foreground-secondary)',
        'foreground-tertiary': 'var(--foreground-tertiary)',
        surface: {
          DEFAULT: 'var(--surface)',
          raised: 'var(--surface-raised)',
          overlay: 'var(--surface-overlay)',
        },
        card: {
          DEFAULT: 'var(--card)',
          foreground: 'var(--card-foreground)',
        },
        popover: {
          DEFAULT: 'var(--popover)',
          foreground: 'var(--popover-foreground)',
        },
        primary: {
          DEFAULT: 'var(--primary)',
          hover: 'var(--primary-hover)',
          active: 'var(--primary-active)',
          foreground: 'var(--primary-foreground)',
          subtle: 'var(--primary-subtle)',
          muted: 'var(--primary-muted)',
        },
        ai: {
          DEFAULT: 'var(--ai)',
          hover: 'var(--ai-hover)',
          active: 'var(--ai-active)',
          foreground: 'var(--ai-foreground)',
          subtle: 'var(--ai-subtle)',
          muted: 'var(--ai-muted)',
        },
        secondary: {
          DEFAULT: 'var(--secondary)',
          foreground: 'var(--secondary-foreground)',
        },
        muted: {
          DEFAULT: 'var(--muted)',
          foreground: 'var(--muted-foreground)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          foreground: 'var(--accent-foreground)',
        },
        destructive: {
          DEFAULT: 'var(--destructive)',
          foreground: 'var(--destructive-foreground)',
        },
        success: {
          DEFAULT: 'var(--success)',
          bg: 'var(--success-bg)',
        },
        warning: {
          DEFAULT: 'var(--warning)',
          bg: 'var(--warning-bg)',
        },
        error: {
          DEFAULT: 'var(--error)',
          bg: 'var(--error-bg)',
        },
        info: {
          DEFAULT: 'var(--info)',
          bg: 'var(--info-bg)',
        },
        sidebar: {
          DEFAULT: 'var(--sidebar)',
          surface: 'var(--sidebar-surface)',
          foreground: 'var(--sidebar-foreground)',
          'foreground-active': 'var(--sidebar-foreground-active)',
          primary: 'var(--sidebar-primary)',
          'primary-foreground': 'var(--sidebar-primary-foreground)',
          accent: 'var(--sidebar-accent)',
          'accent-foreground': 'var(--sidebar-accent-foreground)',
          border: 'var(--sidebar-border)',
          ring: 'var(--sidebar-ring)',
        },
        chart: {
          1: 'var(--chart-1)',
          2: 'var(--chart-2)',
          3: 'var(--chart-3)',
          4: 'var(--chart-4)',
          5: 'var(--chart-5)',
        },
        /* Legacy palette — giữ tương thích trang cũ chưa migrate */
        dark: {
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
        },
      },

      borderRadius: {
        xs: 'var(--radius-xs)',
        sm: 'var(--radius-sm)',
        DEFAULT: 'var(--radius)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
        full: 'var(--radius-full)',
      },

      boxShadow: {
        xs: 'var(--shadow-xs)',
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
        xl: 'var(--shadow-xl)',
      },

      transitionTimingFunction: {
        enterprise: 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
      transitionDuration: {
        fast: '100ms',
        DEFAULT: '150ms',
        slow: '250ms',
      },

      /* ─── Animations (Figma animations.css + legacy) ─── */
      animation: {
        'fade-in': 'vh-fade-in 0.2s cubic-bezier(0.4, 0, 0.2, 1) forwards',
        'fade-in-fast': 'vh-fade-in-fast 0.15s cubic-bezier(0.4, 0, 0.2, 1) forwards',
        'scale-in': 'vh-scale-in 0.18s cubic-bezier(0.4, 0, 0.2, 1) forwards',
        'slide-in-left': 'vh-slide-in-left 0.2s cubic-bezier(0.4, 0, 0.2, 1) forwards',
        'slide-in-right': 'vh-slide-in-right 0.2s cubic-bezier(0.4, 0, 0.2, 1) forwards',
        shimmer: 'vh-shimmer 1.8s infinite linear',
        spin: 'vh-spin 1s linear infinite',
        /* Legacy — giữ cho trang cũ */
        'slide-in': 'slideIn 0.3s ease-out',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        float: 'float 3s ease-in-out infinite',
        slideUp: 'slideUp 0.8s ease-out',
        scaleIn: 'scaleIn 0.6s ease-out',
      },
      keyframes: {
        'vh-shimmer': {
          '0%': { backgroundPosition: '-500px 0' },
          '100%': { backgroundPosition: '500px 0' },
        },
        'vh-fade-in': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'vh-fade-in-fast': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'vh-scale-in': {
          from: { opacity: '0', transform: 'scale(0.96)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        'vh-slide-in-left': {
          from: { opacity: '0', transform: 'translateX(-8px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        'vh-slide-in-right': {
          from: { opacity: '0', transform: 'translateX(8px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        'vh-spin': {
          to: { transform: 'rotate(360deg)' },
        },
        /* Legacy keyframes */
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideIn: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(0)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-20px)' },
        },
        slideUp: {
          '0%': { transform: 'translateY(50px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        scaleIn: {
          '0%': { transform: 'scale(0.8)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};
