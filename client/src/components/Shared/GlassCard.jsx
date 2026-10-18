import { VH_MOTION_CARD } from '../../motion/classes';

/**
 * Glass surface card — hover uses Enterprise Motion SoT (`VH_MOTION_CARD`).
 * `glow` kept for API compat but no longer applies marketing animate-glow.
 */
const GlassCard = ({ children, className = '', hover = false, glow: _glow = false, onClick }) => (
  <div
    onClick={onClick}
    className={`glass rounded-2xl p-6 ${hover ? `${VH_MOTION_CARD} cursor-pointer` : ''} ${className}`.trim()}
  >
    {children}
  </div>
);

export default GlassCard;
