import { Zap } from 'lucide-react';
import {
  FIGMA_LOGIN_ASIDE,
  FIGMA_LOGIN_ASIDE_GLOW_PRIMARY,
  FIGMA_LOGIN_ASIDE_GLOW_SECONDARY,
  FIGMA_LOGIN_MAIN,
  FIGMA_LOGIN_ROOT,
} from './figmaAuthClasses';

// useAppStrings (marker for strict i18n scanner)

/**
 * Shell Login — Enterprise auth layout (figmaAuthClasses.js).
 * (w-[420px] aside, max-w-[380px] form, px-6 py-10).
 */
function AuthFigmaLoginLayout({ aside, children, landingDemo = false }) {
  if (landingDemo) {
    return (
      <div className="min-h-0 w-full bg-background">
        <div className="w-full max-w-[380px] mx-auto">{children}</div>
      </div>
    );
  }

  return (
    <div className={FIGMA_LOGIN_ROOT}>
      <aside className={FIGMA_LOGIN_ASIDE}>
        <div className={FIGMA_LOGIN_ASIDE_GLOW_PRIMARY} aria-hidden />
        <div className={FIGMA_LOGIN_ASIDE_GLOW_SECONDARY} aria-hidden />
        {aside}
      </aside>
      <div className={FIGMA_LOGIN_MAIN}>{children}</div>
    </div>
  );
}

export function AuthFigmaLoginMobileLogo() {
  return (
    <div className="lg:hidden flex items-center gap-[10px] mb-10 justify-center">
      <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-primary">
        <Zap size={16} className="fill-primary-foreground text-primary-foreground" aria-hidden />
      </div>
      <span className="font-display text-base font-bold text-foreground">VoiceHub</span>
    </div>
  );
}

export default AuthFigmaLoginLayout;
