const GlassCard = ({ children, className = "", hover = false, glow = false, onClick }) => (
  <div 
    onClick={onClick} 
    className={`glass rounded-2xl p-6 ${hover ? 'card-hover cursor-pointer' : ''} ${glow ? 'animate-glow' : ''} ${className}`}
  >
    {children}
  </div>
);

export default GlassCard;
