/**
 * Flashlight glyph — tip / beam emit along +X (right), same axis as cone beam.
 * Rotate with the same atan2 angleDeg as LoginFlashlightLayer.
 */
function LoginFlashlightIcon({ className = '', style, strokeWidth = 2, ...rest }) {
  return (
    <svg
      className={className}
      style={style}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      {...rest}
    >
      {/* Handle (left) */}
      <rect
        x="2"
        y="9"
        width="7"
        height="6"
        rx="1.2"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      {/* Body */}
      <path
        d="M9 8.5h5.5a1.5 1.5 0 0 1 1.5 1.5v4a1.5 1.5 0 0 1-1.5 1.5H9V8.5Z"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      {/* Lens / head (right) — light exits here → +X */}
      <path
        d="M16 9.5 20 8v8l-4-1.5V9.5Z"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      <path
        d="M20.5 10.5h1.5M20.5 12h2M20.5 13.5h1.5"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
    </svg>
  );
}

export default LoginFlashlightIcon;
