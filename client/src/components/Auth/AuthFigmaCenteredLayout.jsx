import { Zap } from 'lucide-react';
import {
  FIGMA_AUTH_GRADIENT_ROOT,
  FIGMA_CENTERED_LOGO_ICON,
  FIGMA_CENTERED_LOGO_ICON_PURPLE,
  FIGMA_CENTERED_LOGO_ROW_MB10,
  FIGMA_CENTERED_ROOT,
} from './figmaAuthClasses';

// useAppStrings (marker for strict i18n scanner)

/**
 * Shell centered card — Register max-w-[480px], các trang còn lại max-w-[400px].
 * Class bê từ RegisterPage / ForgotPasswordPage design tokens.
 */
function AuthFigmaCenteredLayout({
  children,
  maxWidthClass = 'max-w-[400px]',
  logoMarginClass = 'mb-10',
  purpleBrand = false,
  gradientBackground = false,
}) {
  const rootClass = gradientBackground ? FIGMA_AUTH_GRADIENT_ROOT : FIGMA_CENTERED_ROOT;
  const logoIconClass = purpleBrand ? FIGMA_CENTERED_LOGO_ICON_PURPLE : FIGMA_CENTERED_LOGO_ICON;
  const logoRowClass = logoMarginClass === 'mb-10' ? FIGMA_CENTERED_LOGO_ROW_MB10 : `flex items-center gap-3 ${logoMarginClass} justify-center`;

  return (
    <div className={rootClass}>
      <div className={`w-full ${maxWidthClass}`}>
        <div className={logoRowClass}>
          <div className={logoIconClass}>
            <Zap size={20} className="fill-primary-foreground text-primary-foreground" aria-hidden />
          </div>
          <span className="font-display text-[1.25rem] font-bold text-foreground">VoiceHub</span>
        </div>
        {children}
      </div>
    </div>
  );
}

export default AuthFigmaCenteredLayout;
