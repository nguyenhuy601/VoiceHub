import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import AuthPageLayout from '../../components/Auth/AuthPageLayout';
import AuthMarketingAside from '../../components/Auth/AuthMarketingAside';
import OneTimeCredentialsModal from '../../components/Auth/OneTimeCredentialsModal';
import BrandPageLoader from '../../components/Shared/BrandPageLoader';
import { authInputSurface, authPrimaryButtonClass } from '../../components/Auth/authFieldClasses';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useAppStrings } from '../../locales/appStrings';
import authService from '../../services/authService';
import { consumeOneTimeLoginCredentials } from '../../utils/oneTimeLoginCredentials';

function LoginPage({ landingDemo = false } = {}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, isAuthenticated, loading: authLoading } = useAuth();
  const { isDarkMode } = useTheme();
  const { t } = useAppStrings();
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  /** null = đang kiểm tra; ok = gateway đã có GATEWAY_INTERNAL_TOKEN */
  const [gatewayTrust, setGatewayTrust] = useState(null);
  const [oneTimeCreds, setOneTimeCreds] = useState(null);
  /** Sau invite: không có mk tạm → gợi ý quên mật khẩu */
  const [inviteForgotHint, setInviteForgotHint] = useState(null);

  const inputBase = authInputSurface(isDarkMode);
  const labelCls = isDarkMode ? 'text-slate-200' : 'text-slate-700';
  const mutedCls = isDarkMode ? 'text-slate-400' : 'text-slate-600';
  const titleCls = isDarkMode ? 'text-white' : 'text-[#0f172a]';
  const linkCyan = isDarkMode ? 'text-cyan-400 hover:text-cyan-300' : 'text-cyan-700 hover:text-cyan-800';
  const showPwdBtn = isDarkMode
    ? 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
    : 'text-slate-500 hover:bg-slate-200/80 hover:text-slate-800';
  const chk = isDarkMode
    ? 'h-[1.125rem] w-[1.125rem] shrink-0 border-slate-600 bg-[#0c1018] text-cyan-500'
    : 'h-[1.125rem] w-[1.125rem] shrink-0 border-slate-300 text-cyan-600';
  const btnPrimary = authPrimaryButtonClass(isDarkMode);
  const submitDisabled =
    loading || gatewayTrust === null || (!landingDemo && gatewayTrust && !gatewayTrust.ok);

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
    // Có mk tạm / vừa từ invite → giữ trang login, không đá về session cũ.
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

  return (
    <AuthPageLayout aside={<AuthMarketingAside />}>
      <h2 className={`text-[1.65rem] font-bold tracking-tight sm:text-[1.85rem] ${titleCls}`}>{t('login.title')}</h2>
      <p className={`mt-3 text-base leading-relaxed sm:text-lg ${mutedCls}`}>{t('login.subtitle')}</p>

      {gatewayTrust && !gatewayTrust.ok && (
        <div
          role="alert"
          className={`mt-6 rounded-xl border px-4 py-3 text-sm leading-relaxed ${
            isDarkMode ? 'border-amber-500/50 bg-amber-950/40 text-amber-100' : 'border-amber-400 bg-amber-50 text-amber-950'
          }`}
        >
          <p className="font-semibold">{t('login.gatewayAlertTitle')}</p>
          <p className="mt-1 opacity-95">
            {gatewayTrust.message || t('login.gatewayAlertFallback')}
          </p>
        </div>
      )}

      {inviteForgotHint ? (
        <div
          role="status"
          className={`mt-6 rounded-xl border px-4 py-3 text-sm leading-relaxed ${
            isDarkMode ? 'border-cyan-500/40 bg-cyan-950/30 text-cyan-100' : 'border-cyan-300 bg-cyan-50 text-cyan-950'
          }`}
        >
          <p className="font-semibold">{t('acceptCompanyInvite.loginNoTempTitle')}</p>
          <p className="mt-1 opacity-95">{t('acceptCompanyInvite.loginNoTempBody')}</p>
          <Link to={forgotHref} className={`mt-2 inline-block font-semibold underline-offset-2 hover:underline ${linkCyan}`}>
            {t('acceptCompanyInvite.loginNoTempCta')}
          </Link>
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="mt-8 space-y-6">
        <div>
          <label htmlFor="email" className={`mb-2.5 block text-base font-semibold ${labelCls}`}>
            {t('login.email')}
          </label>
          <input
            id="email"
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            className={inputBase}
            placeholder={t('login.placeholderEmail')}
            autoComplete="email"
          />
        </div>

        <div>
          <div className="mb-2.5 flex items-center justify-between gap-2">
            <label htmlFor="password" className={`block text-base font-semibold ${labelCls}`}>
              {t('login.password')}
            </label>
            <Link to={forgotHref} className={`text-base font-semibold transition ${linkCyan}`}>
              {t('login.forgot')}
            </Link>
          </div>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              className={`${inputBase} pr-14`}
              placeholder={t('login.placeholderPwd')}
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className={`absolute right-3 top-1/2 -translate-y-1/2 rounded-lg px-2.5 py-1.5 text-sm font-semibold transition ${showPwdBtn}`}
            >
              {showPassword ? t('login.hide') : t('login.show')}
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <label className={`flex cursor-pointer items-center gap-2.5 text-base ${mutedCls}`}>
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className={`rounded border focus:ring-cyan-600/30 ${chk}`}
            />
            {t('login.remember')}
          </label>
        </div>

        <button
          type="submit"
          disabled={submitDisabled}
          className={`flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-lg font-bold text-white shadow-lg transition disabled:cursor-not-allowed disabled:opacity-60 ${btnPrimary}`}
        >
          {loading ? t('login.submitting') : gatewayTrust === null ? t('login.checkingConfig') : t('login.submit')}
          {!loading && <ArrowRight className="h-5 w-5" strokeWidth={2} aria-hidden />}
        </button>
      </form>

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
