import { useTheme } from '../../context/ThemeContext';
import { useAppStrings } from '../../locales/appStrings';

/**
 * Left panel Login — 420px / p-10 (figmaAuthClasses.js).
 */
function AuthMarketingAside() {
  const { isDarkMode } = useTheme();
  const { t, dict } = useAppStrings();
  const chipLabels = dict.authMarketing.chips;

  const badgeOuter = isDarkMode
    ? 'border-slate-600/55 bg-slate-900/50 text-slate-200'
    : 'border-white/35 bg-white/12 text-white';
  const badgeInner = isDarkMode ? 'text-cyan-300/95' : 'text-white';
  const accentBar = isDarkMode ? 'border-cyan-400/55' : 'border-white/85';
  const h1Main = 'text-white';
  const h1Sub = isDarkMode ? 'text-slate-200' : 'text-white/95';
  const body = isDarkMode ? 'text-slate-300' : 'text-white/92';
  const quote = isDarkMode
    ? 'border-cyan-500/30 bg-slate-900/30 text-slate-400'
    : 'border-white/40 bg-white/[0.08] text-white/85';
  const foot = isDarkMode ? 'text-slate-500' : 'text-white/75';
  const chips = isDarkMode ? 'border-slate-700/50 bg-slate-900/25 text-slate-400' : 'border-white/20 bg-white/[0.08] text-white/88';

  return (
    <div className="flex max-w-lg flex-col gap-8 lg:gap-10">
      <div>
        <p
          className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-medium tracking-wide backdrop-blur-sm sm:text-sm ${badgeOuter}`}
        >
          <span className={`font-semibold ${badgeInner}`}>VoiceHub</span>
          <span className={isDarkMode ? 'text-slate-500' : 'text-white/50'} aria-hidden>
            /
          </span>
          <span className={isDarkMode ? 'text-slate-400' : 'text-white/85'}>{t('authMarketing.badgeSub')}</span>
        </p>
      </div>

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
