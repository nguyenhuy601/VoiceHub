import { ShieldCheck, Zap } from 'lucide-react';
import LoginAsideLandscape from './LoginAsideLandscape';
import { useAppStrings } from '../../locales/appStrings';
import './loginNightOwl.css';

const FEATURE_DOT_COLORS = ['#3B82F6', '#34D399', '#FBBF24', '#22D3EE'];

/**
 * Left panel — compact: 3D popup hero (login sample); default: classic marketing.
 */
function AuthMarketingAside({ nightOwl = false, compact = false }) {
  const { t, dict } = useAppStrings();
  const features = dict.authMarketing?.features ?? [];

  if (compact) {
    return (
      <div className={`login-aside-popup ${nightOwl ? 'is-night' : 'is-day'}`}>
        <LoginAsideLandscape />
        <div className="login-aside-popup__copy">
          <h2 className="login-aside-popup__title">{t('authMarketing.loginAsideTitle')}</h2>
          <p className="login-aside-popup__body">{t('authMarketing.loginAsideBody')}</p>
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
