import { Link } from 'react-router-dom';
import { ArrowLeft, Home, Zap } from 'lucide-react';
import {
  FIGMA_404_ACTIONS,
  FIGMA_404_BODY,
  FIGMA_404_BTN_PRIMARY,
  FIGMA_404_BTN_SECONDARY,
  FIGMA_404_CODE,
  FIGMA_404_CODE_GRADIENT,
  FIGMA_404_INNER,
  FIGMA_404_LOGO_ICON,
  FIGMA_404_LOGO_ROW,
  FIGMA_404_LOGO_TEXT,
  FIGMA_404_ROOT,
  FIGMA_404_TITLE,
} from '../../components/Auth/figmaAuthClasses';
import { useAppStrings } from '../../locales/appStrings';

function NotFoundPage() {
  const { t } = useAppStrings();

  return (
    <div className={`${FIGMA_404_ROOT} min-h-[100dvh]`}>
      <div className={FIGMA_404_INNER}>
        <div className={FIGMA_404_LOGO_ROW}>
          <div className={FIGMA_404_LOGO_ICON}>
            <Zap size={20} className="fill-primary-foreground text-primary-foreground" aria-hidden />
          </div>
          <span className={FIGMA_404_LOGO_TEXT}>VoiceHub</span>
        </div>

        <div className={FIGMA_404_CODE} aria-hidden>
          <span className={FIGMA_404_CODE_GRADIENT}>404</span>
        </div>

        <h1 className={FIGMA_404_TITLE}>{t('notFound.title')}</h1>
        <p className={FIGMA_404_BODY}>{t('notFound.body')}</p>

        <div className={FIGMA_404_ACTIONS}>
          <button
            type="button"
            onClick={() => window.history.back()}
            className={FIGMA_404_BTN_SECONDARY}
            aria-label={t('notFound.back')}
          >
            <ArrowLeft size={18} aria-hidden />
            {t('notFound.back')}
          </button>
          <Link to="/app/me/dashboard" className={FIGMA_404_BTN_PRIMARY} aria-label={t('notFound.cta')}>
            <Home size={18} aria-hidden />
            {t('notFound.cta')}
          </Link>
        </div>
      </div>
    </div>
  );
}

export default NotFoundPage;
