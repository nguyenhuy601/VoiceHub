import AuthFigmaLoginLayout from './AuthFigmaLoginLayout';
import { FIGMA_LOGIN_CARD, FIGMA_LOGIN_INNER } from './figmaAuthClasses';

/**
 * Compatibility shell — maps legacy AuthPageLayout API onto Figma login layout.
 */
function AuthPageLayout({
  aside,
  children,
  contentMaxWidth = 'max-w-lg',
  mainAlign = 'center',
  landingDemo = false,
}) {
  const widthClass =
    contentMaxWidth === 'max-w-lg' || contentMaxWidth === 'max-w-[380px]'
      ? FIGMA_LOGIN_INNER
      : `w-full ${contentMaxWidth}`;

  return (
    <AuthFigmaLoginLayout aside={aside} landingDemo={landingDemo}>
      <div className={widthClass}>
        <div className={`${FIGMA_LOGIN_CARD} ${mainAlign === 'start' ? 'text-left' : ''}`}>{children}</div>
      </div>
    </AuthFigmaLoginLayout>
  );
}

export default AuthPageLayout;
