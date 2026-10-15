const STAR_POSITIONS = [
  { top: '14%', left: '18%', delay: '' },
  { top: '22%', left: '42%', delay: 'delay-[400ms]' },
  { top: '12%', left: '68%', delay: 'delay-[900ms]' },
  { top: '28%', left: '78%', delay: 'delay-[400ms]' },
  { top: '18%', left: '88%', delay: '' },
  { top: '32%', left: '30%', delay: 'delay-[900ms]' },
  { top: '8%', left: '55%', delay: 'delay-[400ms]' },
  { top: '26%', left: '12%', delay: '' },
];

const FILLS_DAY = {
  far: '#9ec5c9',
  mid: '#7fadb3',
  near: '#5f8f96',
  tree: '#3d6b72',
  lake: '#6a9aa0',
  lakeOpacity: 0.45,
};

const FILLS_NIGHT = {
  far: '#1a1a2e',
  mid: '#0f0f1c',
  near: '#12121f',
  tree: '#080812',
  lake: '#1e293b',
  lakeOpacity: 0.35,
};

/**
 * Day/night landscape — sun sets / moon rises behind mountain ridge (z-index layers).
 */
function LoginAsideLandscape({ night = false }) {
  const fills = night ? FILLS_NIGHT : FILLS_DAY;

  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden>
      <div className="absolute inset-0 z-0">
        {STAR_POSITIONS.map((star, i) => (
          <span
            key={i}
            className={`absolute h-0.5 w-0.5 rounded-full bg-slate-200 transition-opacity duration-[800ms] ease-in-out motion-reduce:animate-none motion-reduce:transition-none ${
              night
                ? `animate-login-star-twinkle opacity-[0.85] ${star.delay}`
                : 'opacity-0'
            }`}
            style={{ top: star.top, left: star.left }}
          />
        ))}
      </div>

      <div className="absolute inset-0 z-10">
        <div
          className={`absolute left-[14%] top-[11%] h-[3.75rem] w-[3.75rem] rounded-full transition-[opacity,transform] duration-700 ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none ${
            night
              ? 'translate-y-28 scale-75 opacity-0 delay-0'
              : 'translate-y-0 scale-100 opacity-100 delay-150'
          }`}
          style={{
            background:
              'radial-gradient(circle at 40% 35%, #fef9c3 0%, #fbbf24 45%, #f59e0b55 70%, transparent 75%)',
            boxShadow: '0 0 35px rgba(251, 191, 36, 0.6)',
          }}
        />
        <div
          className={`absolute right-[16%] top-[10%] h-16 w-16 rounded-full transition-[opacity,transform] duration-[800ms] ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none ${
            night
              ? 'translate-y-0 scale-100 opacity-100 delay-150'
              : 'translate-y-28 scale-75 opacity-0 delay-0'
          }`}
          style={{
            background:
              'radial-gradient(circle at 35% 35%, #f8fafc 0%, #e2e8f0 42%, #94a3b833 72%, transparent 78%)',
            boxShadow: '0 0 25px rgba(226, 232, 240, 0.7)',
          }}
        />
      </div>

      <svg
        className="absolute inset-x-0 bottom-0 z-20 h-[58%] w-full"
        viewBox="0 0 360 220"
        preserveAspectRatio="none"
      >
        <path
          fill={fills.far}
          d="M0 110 L60 70 L120 105 L180 48 L240 98 L300 60 L360 100 L360 220 L0 220 Z"
        />
        <path
          fill={fills.mid}
          d="M0 140 L80 100 L150 145 L220 85 L290 130 L360 110 L360 220 L0 220 Z"
        />
        <path
          fill={fills.near}
          d="M0 175 L90 145 L160 178 L240 130 L320 168 L360 155 L360 220 L0 220 Z"
        />
        <path fill={fills.tree} d="M45 220 L58 168 L72 220 Z" />
        <path fill={fills.tree} d="M105 220 L122 160 L138 220 Z" />
        <path fill={fills.tree} d="M255 220 L272 165 L288 220 Z" />
        <ellipse
          cx="180"
          cy="200"
          rx="120"
          ry="18"
          fill={fills.lake}
          opacity={fills.lakeOpacity}
        />
      </svg>
    </div>
  );
}

export default LoginAsideLandscape;
