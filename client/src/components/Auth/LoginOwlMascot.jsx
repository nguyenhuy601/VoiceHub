import { forwardRef } from 'react';

/**
 * Owl perched on email top-left — opacity 0 until lit by flashlight beam.
 */
const LoginOwlMascot = forwardRef(function LoginOwlMascot({ lit = false }, ref) {
  return (
    <div
      ref={ref}
      className={`pointer-events-none absolute bottom-[calc(100%-0.15rem)] left-[0.85rem] z-[4] flex w-[2.85rem] flex-col items-center transition-[opacity,filter] duration-[250ms] ease-in-out motion-reduce:transition-none ${
        lit ? 'opacity-100' : 'opacity-0'
      }`}
      aria-hidden
    >
      <svg
        className={`block h-12 w-[2.75rem] ${
          lit ? 'drop-shadow-[0_0_12px_rgba(251,191,36,0.6)]' : ''
        }`}
        viewBox="0 0 80 88"
        fill="none"
      >
        <defs>
          <radialGradient id="loginOwlGlow" cx="50%" cy="42%" r="50%">
            <stop offset="0%" stopColor="#fde68a" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#fde68a" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="loginOwlFur" x1="16" y1="12" x2="64" y2="78" gradientUnits="userSpaceOnUse">
            <stop stopColor="#e2e8f0" />
            <stop offset="0.45" stopColor="#94a3b8" />
            <stop offset="1" stopColor="#64748b" />
          </linearGradient>
          <radialGradient id="loginOwlEyeIris" cx="38%" cy="38%" r="62%">
            <stop offset="0%" stopColor="#fef08a" />
            <stop offset="55%" stopColor="#fbbf24" />
            <stop offset="100%" stopColor="#b45309" />
          </radialGradient>
        </defs>

        {lit ? <ellipse cx="40" cy="40" rx="36" ry="34" fill="url(#loginOwlGlow)" /> : null}

        <path d="M22 30 L14 8 L32 24 Z" fill="#cbd5e1" />
        <path d="M58 30 L66 8 L48 24 Z" fill="#cbd5e1" />
        <path d="M23 28 L18 12 L30 24 Z" fill="#f1f5f9" opacity="0.7" />
        <path d="M57 28 L62 12 L50 24 Z" fill="#f1f5f9" opacity="0.7" />

        <ellipse cx="40" cy="52" rx="24" ry="28" fill="url(#loginOwlFur)" />
        <ellipse cx="40" cy="58" rx="14" ry="16" fill="#e2e8f0" opacity="0.55" />

        <ellipse cx="40" cy="40" rx="22" ry="18" fill="#f8fafc" />
        <ellipse cx="40" cy="42" rx="18" ry="14" fill="#e2e8f0" opacity="0.65" />

        <circle cx="30" cy="40" r="10.5" fill="#0f172a" />
        <circle cx="50" cy="40" r="10.5" fill="#0f172a" />
        <circle
          cx="30"
          cy="40"
          r="7.8"
          fill="url(#loginOwlEyeIris)"
          className={lit ? 'drop-shadow-[0_0_5px_#fbbf24]' : undefined}
        />
        <circle
          cx="50"
          cy="40"
          r="7.8"
          fill="url(#loginOwlEyeIris)"
          className={lit ? 'drop-shadow-[0_0_5px_#fbbf24]' : undefined}
        />
        <circle cx="30" cy="40" r="3.2" fill="#0f172a" />
        <circle cx="50" cy="40" r="3.2" fill="#0f172a" />
        <circle cx="27.2" cy="37.2" r="2.4" fill="#fff" opacity="0.95" />
        <circle cx="47.2" cy="37.2" r="2.4" fill="#fff" opacity="0.95" />

        <path d="M40 46 L36.5 52 L43.5 52 Z" fill="#f59e0b" />
        <path d="M40 47.5 L38 51 L42 51 Z" fill="#fbbf24" />

        <path
          d="M32 78 L28 84 M32 78 L32 84 M32 78 L36 84"
          stroke="#94a3b8"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <path
          d="M48 78 L44 84 M48 78 L48 84 M48 78 L52 84"
          stroke="#94a3b8"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <line
          x1="18"
          y1="85"
          x2="62"
          y2="85"
          stroke="#64748b"
          strokeWidth="2"
          strokeLinecap="round"
          opacity="0.65"
        />
      </svg>
    </div>
  );
});

export default LoginOwlMascot;
