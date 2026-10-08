import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Eye, EyeOff, X } from 'lucide-react';
import AuthPageLayout from '../../components/Auth/AuthPageLayout';
import AuthMarketingAside from '../../components/Auth/AuthMarketingAside';
import LoginFlashlightIcon from '../../components/Auth/LoginFlashlightIcon';
import LoginFlashlightLayer from '../../components/Auth/LoginFlashlightLayer';
import LoginOwlMascot from '../../components/Auth/LoginOwlMascot';
import OneTimeCredentialsModal from '../../components/Auth/OneTimeCredentialsModal';
import BrandPageLoader from '../../components/Shared/BrandPageLoader';
import { authInputSurface, authPrimaryButtonClass } from '../../components/Auth/authFieldClasses';
import { FIGMA_TOGGLE_BTN } from '../../components/Auth/figmaAuthClasses';
import { useLoginFlashlight } from '../../components/Auth/useLoginFlashlight';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useAppStrings } from '../../locales/appStrings';
import authService from '../../services/authService';
import { consumeOneTimeLoginCredentials } from '../../utils/oneTimeLoginCredentials';
import '../../components/Auth/loginNightOwl.css';

function LoginPage({ landingDemo = false } = {}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, isAuthenticated, loading: authLoading } = useAuth();
  const { isDarkMode } = useTheme();
  const { t } = useAppStrings();
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [gatewayTrust, setGatewayTrust] = useState(null);
  const [oneTimeCreds, setOneTimeCreds] = useState(null);
  const [inviteForgotHint, setInviteForgotHint] = useState(null);

  const passwordInputRef = useRef(null);
  const flashlightBtnRef = useRef(null);
  const owlRef = useRef(null);
  const enableFlash = !landingDemo;

  const {
    isFlashlight,
    isNightOwl,
    passwordRevealed,
    owlLit,
    origin,
    angleDeg,
    toggleFlashlight,
  } = useLoginFlashlight({
    enabled: enableFlash,
    originRef: flashlightBtnRef,
  });

  const visualNight = isNightOwl || isDarkMode;
  const inputBase = authInputSurface(visualNight);
  const linkCyan = visualNight ? 'text-cyan-400 hover:text-cyan-300' : 'text-cyan-700 hover:text-cyan-800';
  const showPwdBtn = isFlashlight
    ? 'text-amber-300 hover:bg-slate-800/80 hover:text-amber-200'
    : visualNight
      ? 'text-slate-300 hover:bg-slate-800/80'
      : 'text-slate-500 hover:bg-slate-200/80 hover:text-slate-800';
  const btnPrimary = authPrimaryButtonClass(visualNight);
  const submitDisabled =
    loading || gatewayTrust === null || (!landingDemo && gatewayTrust && !gatewayTrust.ok);
  const closeColor = visualNight ? 'text-slate-200' : 'text-slate-500';

  useEffect(() => {
    const creds = consumeOneTimeLoginCredentials();
    const fromInvite = Boolean(location.state?.fromCompanyInvite);
    const prefillEmail = String(location.state?.prefillEmail || '').trim().toLowerCase();
    const hasTempPassword = Boolean(location.state?.hasTempPassword);
    const alreadyHadAccount = Boolean(location.state?.alreadyHadAccount);

    if (creds) {
      setOneTimeCreds(creds);
      setFormData((prev) => ({
        ...prev,
        email: creds.email || prev.email,
        password: creds.password || prev.password,
      }));
      setInviteForgotHint(null);
    } else if (prefillEmail) {
      setFormData((prev) => ({ ...prev, email: prefillEmail }));
    }

    if (fromInvite && !creds && (alreadyHadAccount || !hasTempPassword)) {
      setInviteForgotHint({ email: prefillEmail });
    }

    if (location.state?.message) {
      toast.success(location.state.message, { id: 'company-invite-flash' });
    }
    if (location.state?.message || location.state?.prefillEmail || fromInvite) {
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  useEffect(() => {
    if (landingDemo) {
      setGatewayTrust({ ok: true, message: '' });
      return;
    }
    let cancelled = false;
    (async () => {
      const trust = await authService.checkGatewayTrust();
      if (!cancelled) {
        setGatewayTrust({
          ok: trust.gatewayTrustConfigured,
          message: trust.message || '',
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [landingDemo]);

  useEffect(() => {
    if (landingDemo || authLoading) return;
    if (oneTimeCreds || inviteForgotHint) return;
    if (isAuthenticated) {
      navigate('/app', { replace: true });
    }
  }, [landingDemo, authLoading, isAuthenticated, navigate, oneTimeCreds, inviteForgotHint]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (landingDemo) {
      toast(t('login.demoToast'), { icon: '🔒' });
      return;
    }

    if (!formData.email || !formData.password) {
      return;
    }

    setLoading(true);
    try {
      const success = await login(formData.email, formData.password);
      if (success) {
        navigate('/app');
      }
    } catch (error) {
      console.error('Login error:', error);
    } finally {
      setLoading(false);
    }
  };

  const forgotHref = inviteForgotHint?.email
    ? `/forgot-password?email=${encodeURIComponent(inviteForgotHint.email)}`
    : formData.email
      ? `/forgot-password?email=${encodeURIComponent(formData.email)}`
      : '/forgot-password';

  if (!landingDemo && !authLoading && isAuthenticated && !oneTimeCreds && !inviteForgotHint) {
    return <BrandPageLoader />;
  }

  const flashToggleLabel = enableFlash
    ? isFlashlight
      ? t('login.flashlightOff')
      : t('login.flashlightOn')
    : passwordRevealed
      ? t('login.hide')
      : t('login.show');

  return (
    <AuthPageLayout
      aside={<AuthMarketingAside nightOwl={isNightOwl} compact={!landingDemo} />}
      landingDemo={landingDemo}
      nightOwl={isNightOwl}
      glassCard={!landingDemo}
      showcaseAside={!landingDemo}
    >
      <LoginFlashlightLayer
        active={isFlashlight}
        originX={origin.x}
        originY={origin.y}
        angleDeg={angleDeg}
      />

      <div className={`login-form-stage ${closeColor}`}>
        {!landingDemo ? (
          <Link to="/" className="login-form-stage__close" aria-label={t('authLayout.home')} title={t('authLayout.home')}>
            <X className="h-5 w-5" strokeWidth={2} aria-hidden />
          </Link>
        ) : null}

        <h2
          className={`text-center text-[1.65rem] font-bold tracking-tight sm:text-[1.85rem] ${
            visualNight ? 'login-form-stage__title--night' : 'text-[#0f172a]'
          }`}
        >
          {t('login.title')}
        </h2>

        {gatewayTrust && !gatewayTrust.ok && (
          <div
            role="alert"
            className={`mt-4 rounded-xl border px-4 py-3 text-sm leading-relaxed ${
              visualNight ? 'border-amber-500/50 bg-amber-950/40 text-amber-100' : 'border-amber-400 bg-amber-50 text-amber-950'
            }`}
          >
            <p className="font-semibold">{t('login.gatewayAlertTitle')}</p>
            <p className="mt-1 opacity-95">{gatewayTrust.message || t('login.gatewayAlertFallback')}</p>
          </div>
        )}

        {inviteForgotHint ? (
          <div
            role="status"
            className={`mt-4 rounded-xl border px-4 py-3 text-sm leading-relaxed ${
              visualNight ? 'border-cyan-500/40 bg-cyan-950/30 text-cyan-100' : 'border-cyan-300 bg-cyan-50 text-cyan-950'
            }`}
          >
            <p className="font-semibold">{t('acceptCompanyInvite.loginNoTempTitle')}</p>
            <p className="mt-1 opacity-95">{t('acceptCompanyInvite.loginNoTempBody')}</p>
            <Link to={forgotHref} className={`mt-2 inline-block font-semibold underline-offset-2 hover:underline ${linkCyan}`}>
              {t('acceptCompanyInvite.loginNoTempCta')}
            </Link>
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="relative mt-8 space-y-5">
          <div className="login-email-block relative pt-8">
            {enableFlash ? <LoginOwlMascot ref={owlRef} lit={owlLit} /> : null}
            <input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className={inputBase}
              placeholder={t('login.placeholderEmail')}
              autoComplete="email"
              aria-label={t('login.email')}
            />
          </div>

          <div>
            <div className="relative z-[2]">
              <input
                ref={passwordInputRef}
                id="password"
                type={passwordRevealed ? 'text' : 'password'}
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className={`${inputBase} relative z-[2] pr-12 ${
                  passwordRevealed && isFlashlight ? 'login-pwd-reveal' : ''
                }`}
                placeholder={t('login.placeholderPwd')}
                autoComplete="current-password"
                aria-label={t('login.password')}
              />
              <button
                ref={flashlightBtnRef}
                type="button"
                onClick={toggleFlashlight}
                className={`${FIGMA_TOGGLE_BTN} z-[3] rounded-lg p-1.5 ${showPwdBtn}`}
                aria-label={flashToggleLabel}
                aria-controls="password"
                aria-pressed={enableFlash ? isFlashlight : passwordRevealed}
                title={enableFlash ? t('login.nightOwlHint') : undefined}
              >
                {enableFlash ? (
                  isFlashlight ? (
                    <LoginFlashlightIcon
                      className="login-flashlight-icon h-5 w-5"
                      strokeWidth={2}
                      style={{ transform: `rotate(${angleDeg}deg)` }}
                    />
                  ) : (
                    <Eye className="h-5 w-5" strokeWidth={2} aria-hidden />
                  )
                ) : passwordRevealed ? (
                  <EyeOff className="h-5 w-5" strokeWidth={2} aria-hidden />
                ) : (
                  <Eye className="h-5 w-5" strokeWidth={2} aria-hidden />
                )}
              </button>
            </div>
            <div className="mt-2 flex justify-end">
              <Link to={forgotHref} className={`text-sm font-semibold transition ${linkCyan}`}>
                {t('login.forgot')}
              </Link>
            </div>
          </div>

          <button
            type="submit"
            disabled={submitDisabled}
            className={`flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-base font-bold text-white shadow-lg vh-transition disabled:cursor-not-allowed disabled:opacity-60 ${btnPrimary}`}
          >
            {loading ? t('login.submitting') : gatewayTrust === null ? t('login.checkingConfig') : t('login.submit')}
            {!loading && <ArrowRight className="h-5 w-5" strokeWidth={2} aria-hidden />}
          </button>
        </form>

        {!landingDemo ? (
          <p className={`mt-6 text-center text-sm ${visualNight ? 'text-slate-400' : 'text-slate-600'}`}>
            {t('login.noAccount')}{' '}
            <Link to="/register" className={`font-semibold underline-offset-2 hover:underline ${linkCyan}`}>
              {t('login.goRegister')}
            </Link>
          </p>
        ) : null}
      </div>

      <OneTimeCredentialsModal
        open={Boolean(oneTimeCreds)}
        email={oneTimeCreds?.email}
        password={oneTimeCreds?.password}
        onClose={() => setOneTimeCreds(null)}
      />
    </AuthPageLayout>
  );
}

export default LoginPage;
