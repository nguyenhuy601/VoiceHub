import { ShieldCheck, Zap } from 'lucide-react';
import LoginAsideLandscape from './LoginAsideLandscape';
import { useAppStrings } from '../../locales/appStrings';

const FEATURE_DOT_COLORS = ['#3B82F6', '#34D399', '#FBBF24', '#22D3EE'];

/**
 * Left panel — compact: 3D popup hero (login sample); default: classic marketing.
 */
function AuthMarketingAside({ nightOwl = false, compact = false }) {
  const { t, dict } = useAppStrings();
  const features = dict.authMarketing?.features ?? [];

  if (compact) {
    return (
      <div
        className={`relative flex h-full min-h-[30rem] w-full flex-col justify-end overflow-hidden rounded-[1.15rem] border transition-[background,border-color,box-shadow] duration-[800ms] ease-in-out ${
          nightOwl
            ? 'border-white/10 shadow-[0_18px_40px_-14px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.08)]'
            : 'border-white/35 shadow-[0_18px_40px_-16px_rgba(15,23,42,0.35),inset_0_1px_0_rgba(255,255,255,0.4)]'
        }`}
        style={{
          background: nightOwl
            ? 'linear-gradient(165deg, #070b14 0%, #0c1220 50%, #111a2e 100%)'
            : 'linear-gradient(165deg, #bddadb 0%, #9ec4c5 48%, #7ea5a6 100%)',
        }}
      >
        <LoginAsideLandscape night={nightOwl} />
        <div
          className="relative z-30 flex flex-col items-center justify-center px-[1.35rem] pb-7 pt-6 text-center transition-[background] duration-[800ms] ease-in-out"
          style={{
            background: nightOwl
              ? 'linear-gradient(0deg, rgba(0, 0, 0, 0.72) 0%, rgba(0, 0, 0, 0.2) 65%, transparent 100%)'
              : 'linear-gradient(0deg, rgba(15, 23, 42, 0.55) 0%, rgba(15, 23, 42, 0.12) 70%, transparent 100%)',
          }}
        >
          <h2 className="font-display mb-[0.55rem] text-center text-2xl font-bold leading-snug tracking-[-0.02em] text-white">
            {t('authMarketing.loginAsideTitle')}
          </h2>
          <p className="mx-auto max-w-[18rem] text-center text-[0.8125rem] leading-[1.65] text-white/90">
            {t('authMarketing.loginAsideBody')}
          </p>
        </div>
      </div>
    );
  }

  const bodyCls = 'text-[0.875rem] leading-[1.7] max-w-[300px] text-[#5E5E7E]';
  const featureCls = 'text-[0.8125rem] text-[#A0A0C0]';
  const badgeTextCls = 'text-[0.75rem] leading-snug text-[#5E5E7E]';
  const copyCls = 'text-[0.6875rem] text-[#2A2A40]';

  return (
    <div className="flex max-w-lg flex-col gap-8 lg:gap-10">
      <div>
        <div className="mb-14 flex items-center gap-[10px]">
          <div className="flex h-[34px] w-[34px] items-center justify-center rounded-[9px] bg-primary shadow-md shadow-primary/40">
            <Zap size={17} className="fill-primary-foreground text-primary-foreground" aria-hidden />
          </div>
          <span className="font-display text-[1.0625rem] font-bold tracking-tight text-sidebar-foreground-active">
            VoiceHub
          </span>
        </div>

        <h2 className="font-display mb-3.5 text-[1.75rem] font-bold leading-[1.3] tracking-[-0.03em] text-sidebar-foreground-active">
          {t('authMarketing.h1a')}
          <br />
          <span className="text-primary">{t('authMarketing.h1b')}</span>
        </h2>
        <p className={bodyCls}>{t('authMarketing.body')}</p>
      </div>

      <div>
        {features.length > 0 && (
          <ul className="mb-10 flex flex-col gap-3">
            {features.map((label, i) => (
              <li key={label} className="flex items-center gap-3">
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: FEATURE_DOT_COLORS[i % FEATURE_DOT_COLORS.length] }}
                  aria-hidden
                />
                <span className={featureCls}>{label}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-center gap-2 rounded-lg border border-white/[0.07] bg-white/[0.04] px-[14px] py-2.5">
          <ShieldCheck size={15} className="shrink-0 text-success" aria-hidden />
          <span className={badgeTextCls}>{t('authMarketing.trustBadge')}</span>
        </div>
      </div>

      <p className={copyCls}>{t('authMarketing.copyright')}</p>
    </div>
  );
}

export default AuthMarketingAside;
