/**
 * Cone beam from fixed flashlight origin; rotates with angleDeg.
 * pointer-events: none — never blocks form.
 */
function LoginFlashlightLayer({ active, originX = 0, originY = 0, angleDeg = -180 }) {
  if (!active) return null;

  return (
    <div
      className="login-flashlight-layer"
      style={{
        '--ox': `${originX}px`,
        '--oy': `${originY}px`,
        '--deg': `${angleDeg}deg`,
      }}
      aria-hidden
    >
      <div className="login-flashlight-beam" />
      <div className="login-flashlight-glow" />
    </div>
  );
}

export default LoginFlashlightLayer;
