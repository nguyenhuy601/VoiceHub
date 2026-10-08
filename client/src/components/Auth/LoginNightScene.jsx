import './loginNightOwl.css';

/**
 * Aside night landscape only — owl mascot lives above the email field.
 */
function LoginNightScene({ active = false }) {
  if (!active) return null;

  return (
    <div className="login-night-scene" aria-hidden>
      <div className="login-night-scene__moon" />
      <div className="login-night-scene__stars">
        <span style={{ top: '18%', left: '62%' }} />
        <span style={{ top: '28%', left: '78%', width: 3, height: 3 }} />
        <span style={{ top: '14%', left: '48%' }} />
        <span style={{ top: '36%', left: '22%' }} />
        <span style={{ top: '22%', left: '88%' }} />
        <span style={{ top: '42%', left: '70%' }} />
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
