/**
 * Day/night landscape — sun sets / moon rises behind mountain ridge (z-index layers).
 * Toggled via parent .is-day / .is-night on .login-aside-popup.
 */
function LoginAsideLandscape() {
  return (
    <div className="login-aside-landscape" aria-hidden>
      {/* z-0: stars on sky */}
      <div className="login-aside-landscape__stars">
        <span style={{ top: '14%', left: '18%' }} />
        <span style={{ top: '22%', left: '42%' }} />
        <span style={{ top: '12%', left: '68%' }} />
        <span style={{ top: '28%', left: '78%' }} />
        <span style={{ top: '18%', left: '88%' }} />
        <span style={{ top: '32%', left: '30%' }} />
        <span style={{ top: '8%', left: '55%' }} />
        <span style={{ top: '26%', left: '12%' }} />
      </div>

      {/* z-10: sun & moon — sit behind mountains */}
      <div className="login-aside-landscape__celestial">
        <div className="login-aside-landscape__sun" />
        <div className="login-aside-landscape__moon" />
      </div>

      {/* z-20: ridge covers celestial bodies when they sink */}
      <svg className="login-aside-landscape__mountains" viewBox="0 0 360 220" preserveAspectRatio="none">
        <path
          className="login-aside-mtn login-aside-mtn--far"
          d="M0 110 L60 70 L120 105 L180 48 L240 98 L300 60 L360 100 L360 220 L0 220 Z"
        />
        <path
          className="login-aside-mtn login-aside-mtn--mid"
          d="M0 140 L80 100 L150 145 L220 85 L290 130 L360 110 L360 220 L0 220 Z"
        />
        <path
          className="login-aside-mtn login-aside-mtn--near"
          d="M0 175 L90 145 L160 178 L240 130 L320 168 L360 155 L360 220 L0 220 Z"
        />
        <path className="login-aside-tree" d="M45 220 L58 168 L72 220 Z" />
        <path className="login-aside-tree" d="M105 220 L122 160 L138 220 Z" />
        <path className="login-aside-tree" d="M255 220 L272 165 L288 220 Z" />
        <ellipse className="login-aside-lake" cx="180" cy="200" rx="120" ry="18" />
      </svg>
    </div>
  );
}

export default LoginAsideLandscape;
