const BEAM_GRADIENT =
  'linear-gradient(to right, rgba(254, 240, 138, 0.55) 0%, rgba(253, 224, 71, 0.28) 40%, rgba(250, 204, 21, 0.08) 78%, transparent 100%)';
const GLOW_GRADIENT = 'radial-gradient(circle, #fef08a 0%, #facc1544 50%, transparent 72%)';

/**
 * Cone beam from fixed flashlight origin; rotates with angleDeg.
 * pointer-events: none — never blocks form.
 */
function LoginFlashlightLayer({ active, originX = 0, originY = 0, angleDeg = -180 }) {
  if (!active) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[15]" aria-hidden>
      <div
        className="absolute h-40 w-[350px] origin-left opacity-95 mix-blend-screen blur-[0.4px]"
        style={{
          left: originX,
          top: originY,
          transform: `translate(0, -50%) rotate(${angleDeg}deg)`,
          clipPath: 'polygon(0 42%, 0 58%, 100% 100%, 100% 0)',
          background: BEAM_GRADIENT,
        }}
      />
      <div
        className="absolute h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full mix-blend-screen"
        style={{
          left: originX,
          top: originY,
          background: GLOW_GRADIENT,
        }}
      />
    </div>
  );
}

export default LoginFlashlightLayer;
