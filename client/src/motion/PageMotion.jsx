import { useLocation } from 'react-router-dom';
import { VH_MOTION_PAGE } from './classes.js';

/**
 * Fade-in-fast khi đổi route (pathname). Gắn quanh Outlet trong shell.
 * Respects prefers-reduced-motion via motion-safe / vh-motion-respect.
 */
export default function PageMotion({ children, className = '' }) {
  const { pathname } = useLocation();
  return (
    <div key={pathname} className={`${VH_MOTION_PAGE} ${className}`.trim()}>
      {children}
    </div>
  );
}
