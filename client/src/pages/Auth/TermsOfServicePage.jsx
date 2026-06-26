import { Link } from 'react-router-dom';
import { ArrowLeft, FileText, Zap } from 'lucide-react';
import {
  FIGMA_LEGAL_CONTAINER,
  FIGMA_LEGAL_FOOTER,
  FIGMA_LEGAL_LINK_PRIMARY,
  FIGMA_LEGAL_LINK_SECONDARY,
  FIGMA_LEGAL_LOGO_ICON,
  FIGMA_LEGAL_LOGO_ROW,
  FIGMA_LEGAL_LOGO_TEXT,
  FIGMA_LEGAL_ROOT,
  FIGMA_LEGAL_SECTION_CARD,
  FIGMA_LEGAL_SECTION_H,
  FIGMA_LEGAL_SECTION_P,
  FIGMA_LEGAL_SECTIONS,
  FIGMA_LEGAL_TITLE_ROW,
  FIGMA_LEGAL_UPDATED,
} from '../../components/Auth/figmaAuthClasses';
import { useAppStrings } from '../../locales/appStrings';

const SECTION_KEYS = ['s1', 's2', 's3', 's4', 's5', 's6'];

function TermsOfServicePage() {
  const { t } = useAppStrings();

  return (
    <div className={FIGMA_LEGAL_ROOT}>
      <div className={FIGMA_LEGAL_CONTAINER}>
        <div className={FIGMA_LEGAL_LOGO_ROW}>
          <div className={FIGMA_LEGAL_LOGO_ICON}>
            <Zap size={20} className="text-white" aria-hidden />
          </div>
          <span className={FIGMA_LEGAL_LOGO_TEXT}>VoiceHub</span>
        </div>

        <div className={FIGMA_LEGAL_TITLE_ROW}>
          <FileText size={28} className="text-violet-400" aria-hidden />
          <h1 className="font-display text-foreground">{t('termsOfService.title')}</h1>
        </div>

        <p className={FIGMA_LEGAL_UPDATED}>{t('termsOfService.subtitle')}</p>

        <div className={FIGMA_LEGAL_SECTIONS}>
          {SECTION_KEYS.map((key) => (
            <section key={key} className={FIGMA_LEGAL_SECTION_CARD}>
              <h2 className={FIGMA_LEGAL_SECTION_H}>{t(`termsOfService.${key}h`)}</h2>
              <p className={FIGMA_LEGAL_SECTION_P}>{t(`termsOfService.${key}p`)}</p>
            </section>
          ))}

          <section className={FIGMA_LEGAL_SECTION_CARD}>
            <p className={FIGMA_LEGAL_SECTION_P}>
              {t('termsOfService.callout')}
              <span className="font-semibold text-violet-300">{t('termsOfService.calloutEmail')}</span>.
            </p>
          </section>
        </div>

        <div className={FIGMA_LEGAL_FOOTER}>
          <Link to="/register" className={FIGMA_LEGAL_LINK_PRIMARY}>
            <ArrowLeft size={16} aria-hidden />
            {t('termsOfService.backToRegister')}
          </Link>
          <Link to="/" className={FIGMA_LEGAL_LINK_SECONDARY}>
            {t('common.backHome')}
          </Link>
        </div>
      </div>
    </div>
  );
}

export default TermsOfServicePage;
