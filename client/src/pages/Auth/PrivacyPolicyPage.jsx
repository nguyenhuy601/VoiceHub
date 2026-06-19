import { Link } from 'react-router-dom';
import { ArrowLeft, Shield, Zap } from 'lucide-react';
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

function PrivacyPolicyPage() {
  const { isDarkMode } = useTheme();
  const { t } = useAppStrings();
  const h1 = isDarkMode ? 'text-white' : 'text-[#0f172a]';
  const h2 = isDarkMode ? 'text-white' : 'text-slate-900';
  const body = isDarkMode ? 'text-slate-300' : 'text-slate-600';
  const linkCyan = isDarkMode ? 'text-cyan-400 hover:underline' : 'text-cyan-700 hover:underline';
  const callout = isDarkMode
    ? 'rounded-xl border border-cyan-500/25 bg-cyan-500/[0.08] p-4 text-cyan-100'
    : 'rounded-xl border border-cyan-200/90 bg-cyan-50 p-4 text-cyan-950';
  const iconWrap = isDarkMode ? 'bg-cyan-500/15 text-cyan-300' : 'bg-cyan-100 text-cyan-700';

  return (
    <AuthPageLayout aside={<AuthMarketingAside />} contentMaxWidth="max-w-4xl" mainAlign="start">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${iconWrap}`}>
            <Shield className="h-6 w-6" strokeWidth={1.75} aria-hidden />
          </div>
          <div>
            <h1 className={`text-2xl font-bold tracking-tight sm:text-3xl ${h1}`}>{t('privacyPolicy.title')}</h1>
            <p className={`mt-2 text-base ${body}`}>{t('privacyPolicy.subtitle')}</p>
          </div>
        </div>

        <div className={FIGMA_LEGAL_TITLE_ROW}>
          <Shield size={28} className="text-violet-400" aria-hidden />
          <h1 className="font-display text-foreground">{t('privacyPolicy.title')}</h1>
        </div>

        <p className={FIGMA_LEGAL_UPDATED}>{t('privacyPolicy.subtitle')}</p>

        <div className={FIGMA_LEGAL_SECTIONS}>
          {SECTION_KEYS.map((key) => (
            <section key={key} className={FIGMA_LEGAL_SECTION_CARD}>
              <h2 className={FIGMA_LEGAL_SECTION_H}>{t(`privacyPolicy.${key}h`)}</h2>
              <p className={FIGMA_LEGAL_SECTION_P}>{t(`privacyPolicy.${key}p`)}</p>
            </section>
          ))}

        <section className={callout}>
          <p className="text-base">
            {t('privacyPolicy.callout')}
            <span className="font-semibold">{t('privacyPolicy.calloutEmail')}</span>.
          </p>
        </section>
      </div>
    </AuthPageLayout>
  );
}

export default PrivacyPolicyPage;
