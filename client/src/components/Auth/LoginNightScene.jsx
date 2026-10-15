/**
 * Aside night landscape only — owl mascot lives above the email field.
 * (Legacy helper; LoginAsideLandscape is the active showcase landscape.)
 */
function LoginNightScene({ active = false }) {
  if (!active) return null;

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div
        className="absolute right-[18%] top-[12%] h-14 w-14 rounded-full"
        style={{
          background:
            'radial-gradient(circle at 35% 35%, #f8fafc 0%, #e2e8f0 42%, #94a3b833 72%, transparent 78%)',
          boxShadow: '0 0 25px rgba(226, 232, 240, 0.7)',
        }}
      />
      <div className="absolute inset-0">
        <span className="absolute h-0.5 w-0.5 rounded-full bg-slate-200 opacity-85" style={{ top: '18%', left: '62%' }} />
        <span className="absolute h-[3px] w-[3px] rounded-full bg-slate-200 opacity-85" style={{ top: '28%', left: '78%' }} />
        <span className="absolute h-0.5 w-0.5 rounded-full bg-slate-200 opacity-85" style={{ top: '14%', left: '48%' }} />
        <span className="absolute h-0.5 w-0.5 rounded-full bg-slate-200 opacity-85" style={{ top: '36%', left: '22%' }} />
        <span className="absolute h-0.5 w-0.5 rounded-full bg-slate-200 opacity-85" style={{ top: '22%', left: '88%' }} />
        <span className="absolute h-0.5 w-0.5 rounded-full bg-slate-200 opacity-85" style={{ top: '42%', left: '70%' }} />
      </div>

      <svg
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[48%] w-full"
        viewBox="0 0 420 180"
        preserveAspectRatio="none"
      >
        <path fill="#12122a" d="M0 90 L70 55 L140 95 L210 40 L280 88 L350 50 L420 85 L420 180 L0 180 Z" />
        <path fill="#0a0a18" d="M0 120 L90 85 L170 125 L250 70 L330 115 L420 90 L420 180 L0 180 Z" />
        <path fill="#060612" d="M40 180 L55 130 L70 180 Z" />
        <path fill="#060612" d="M95 180 L112 118 L130 180 Z" />
        <path fill="#060612" d="M300 180 L318 125 L336 180 Z" />
        <path fill="#060612" d="M200 180 L214 128 L228 180 Z" />
      </svg>
    </div>
  );
}

export default LoginNightScene;
