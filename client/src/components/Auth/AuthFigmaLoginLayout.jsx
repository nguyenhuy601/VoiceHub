import { Zap } from 'lucide-react';
import {
  FIGMA_LOGIN_ASIDE,
  FIGMA_LOGIN_ASIDE_GLOW_PRIMARY,
  FIGMA_LOGIN_ASIDE_GLOW_SECONDARY,
  FIGMA_LOGIN_ASIDE_NIGHT,
  FIGMA_LOGIN_MAIN,
  FIGMA_LOGIN_ROOT,
} from './figmaAuthClasses';

// useAppStrings (marker for strict i18n scanner)

/**
 * Shell Login — showcaseAside = single centered split card (sample).
 * nightOwl local only; does not touch ThemeContext.
 */
function AuthFigmaLoginLayout({
  aside,
  children,
  landingDemo = false,
  nightOwl = false,
  showcaseAside = false,
}) {
  const showNight = Boolean(nightOwl) && !landingDemo;

  if (landingDemo) {
    return (
      <div className="min-h-0 w-full bg-background">
        <div className="mx-auto w-full max-w-[380px]">{children}</div>
      </div>
    );
  }

  if (showcaseAside) {
    return (
      <div
        className={`${FIGMA_LOGIN_ROOT} items-center justify-center px-4 py-10 ${
          showNight
            ? 'bg-[#070712]'
            : 'bg-gradient-to-br from-[#d8ecee] via-[#c5dfe3] to-[#b7d4da]'
        }`}
      >
        <div
          className={`flex w-full max-w-4xl min-h-[34rem] overflow-hidden rounded-[28px] ${
            showNight
              ? 'bg-[#0c0c14] shadow-[0_25px_50px_-12px_rgba(0,0,0,0.65),0_0_0_1px_rgba(255,255,255,0.08)]'
              : 'bg-[color-mix(in_srgb,#fff_88%,#e0f2f1)] shadow-[0_25px_50px_-12px_rgba(15,23,42,0.28),0_0_0_1px_rgba(255,255,255,0.35)]'
          }`}
        >
          <aside className="hidden w-[40%] shrink-0 p-[1.15rem] lg:flex lg:flex-col">
            <div className="relative z-[2] flex h-full min-h-[32rem] w-full flex-col">{aside}</div>
          </aside>
          <div className="relative z-20 flex flex-1 items-center justify-center px-7 py-8 pointer-events-auto">
            {children}
          </div>
        </div>
      </div>
    );
  }

  const asideClass = showNight ? FIGMA_LOGIN_ASIDE_NIGHT : FIGMA_LOGIN_ASIDE;

  return (
    <div className={FIGMA_LOGIN_ROOT}>
      <aside className={asideClass}>
        <div className={FIGMA_LOGIN_ASIDE_GLOW_PRIMARY} aria-hidden />
        <div className={FIGMA_LOGIN_ASIDE_GLOW_SECONDARY} aria-hidden />
        <div className="relative z-[2] flex h-full min-h-[36rem] w-full flex-col justify-between">{aside}</div>
      </aside>
      <div
        className={
          showNight
            ? 'relative flex flex-1 items-center justify-center bg-[#070712]/90 px-6 py-10 backdrop-blur-md'
            : FIGMA_LOGIN_MAIN
        }
      >
        <div className="relative z-[2] flex w-full justify-center">{children}</div>
      </div>
    </div>
  );
}

export function AuthFigmaLoginMobileLogo() {
  return (
    <div className="mb-10 flex items-center justify-center gap-[10px] lg:hidden">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
        <Zap size={16} className="fill-primary-foreground text-primary-foreground" aria-hidden />
      </div>
      <span className="font-display text-base font-bold text-foreground">VoiceHub</span>
    </div>
  );
}

export default AuthFigmaLoginLayout;
