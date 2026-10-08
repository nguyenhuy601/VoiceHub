import AuthFigmaLoginLayout from './AuthFigmaLoginLayout';
import { FIGMA_LOGIN_CARD, FIGMA_LOGIN_CARD_GLASS, FIGMA_LOGIN_CARD_NIGHT, FIGMA_LOGIN_INNER } from './figmaAuthClasses';

/**
 * Compatibility shell — maps legacy AuthPageLayout API onto Figma login layout.
 * showcaseAside: single split card (no nested glass card).
 */
function AuthPageLayout({
  aside,
  children,
  contentMaxWidth = 'max-w-lg',
  mainAlign = 'center',
  landingDemo = false,
  nightOwl = false,
  glassCard = false,
  showcaseAside = false,
}) {
  if (showcaseAside && !landingDemo) {
    return (
      <AuthFigmaLoginLayout aside={aside} landingDemo={landingDemo} nightOwl={nightOwl} showcaseAside>
        {children}
      </AuthFigmaLoginLayout>
    );
  }

  const widthClass =
    contentMaxWidth === 'max-w-lg' || contentMaxWidth === 'max-w-[380px]'
      ? FIGMA_LOGIN_INNER
      : `w-full ${contentMaxWidth}`;

  let cardClass = FIGMA_LOGIN_CARD;
  if (nightOwl && !landingDemo) {
    cardClass = FIGMA_LOGIN_CARD_NIGHT;
  } else if (glassCard) {
    cardClass = FIGMA_LOGIN_CARD_GLASS;
  }

  return (
    <AuthFigmaLoginLayout
      aside={aside}
      landingDemo={landingDemo}
      nightOwl={nightOwl}
      showcaseAside={false}
    >
      <div className={widthClass}>
        <div className={`${cardClass} ${mainAlign === 'start' ? 'text-left' : ''}`}>{children}</div>
      </div>
    </AuthFigmaLoginLayout>
  );
}

export default AuthPageLayout;
