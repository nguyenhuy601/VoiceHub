import { ShieldCheck } from 'lucide-react';
import { useAppStrings } from '../../locales/appStrings';

const FEATURE_DOT_COLORS = ['#8B5CF6', '#06B6D4', '#10B981', '#F59E0B'];

/**
 * Left panel Login — 420px / p-10 (figmaAuthClasses.js).
 */
function AuthMarketingAside() {
  const { t, dict } = useAppStrings();
  const features = dict.authMarketing.features || [];

  return (
    <div className="flex max-w-lg flex-col gap-8 lg:gap-10">
      <div>
        <p className="inline-flex items-center gap-2 rounded-full border border-white/[0.07] bg-white/[0.04] px-4 py-2 text-xs font-medium tracking-wide backdrop-blur-sm sm:text-sm text-[#A0A0C0]">
          <span className="font-semibold text-sidebar-foreground-active">VoiceHub</span>
          <span className="text-[#5E5E7E]" aria-hidden>
            /
          </span>
          <span>{t('authMarketing.badgeSub')}</span>
        </p>
      </div>

      <div>
        <h2 className="font-display text-[1.75rem] font-bold leading-[1.3] tracking-[-0.03em] text-sidebar-foreground-active mb-3.5">
          {t('authMarketing.h1a')}
          <br />
          <span className="text-primary">{t('authMarketing.h1b')}</span>
        </h2>
        <p className="text-[0.875rem] leading-[1.7] max-w-[300px] text-[#5E5E7E]">{t('authMarketing.body')}</p>
      </div>

      <div>
        {features.length > 0 && (
          <ul className="flex flex-col gap-3 mb-10">
            {features.map((label, i) => (
              <li key={label} className="flex items-center gap-3">
                <span
                  className="w-1.5 h-1.5 shrink-0 rounded-full"
                  style={{ background: FEATURE_DOT_COLORS[i % FEATURE_DOT_COLORS.length] }}
                  aria-hidden
                />
                <span className="text-[0.8125rem] text-[#A0A0C0]">{label}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-center gap-2 px-[14px] py-2.5 rounded-lg border border-white/[0.07] bg-white/[0.04]">
          <ShieldCheck size={15} className="shrink-0 text-success" aria-hidden />
          <span className="text-[0.75rem] leading-snug text-[#5E5E7E]">{t('authMarketing.trustBadge')}</span>
        </div>
      </div>

      <p className="text-[0.6875rem] text-[#2A2A40]">{t('authMarketing.copyright')}</p>
    </div>
  );
}

export default AuthMarketingAside;
