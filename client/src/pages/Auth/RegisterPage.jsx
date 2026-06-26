import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CheckCircle2, Eye, EyeOff, Lock, Mail, User, XCircle } from 'lucide-react';
import AuthFigmaCenteredLayout from '../../components/Auth/AuthFigmaCenteredLayout';
import AuthFigmaLoginLayout, { AuthFigmaLoginMobileLogo } from '../../components/Auth/AuthFigmaLoginLayout';
import AuthMarketingAside from '../../components/Auth/AuthMarketingAside';
import {
  FIGMA_BTN,
  FIGMA_BTN_SPINNER,
  FIGMA_CENTERED_CARD,
  FIGMA_REGISTER_SPLIT_INNER,
  FIGMA_ERR,
  FIGMA_FIELD_GROUP,
  FIGMA_FORM_SPACE_4,
  FIGMA_GRID_DOB,
  FIGMA_GRID_NAME,
  FIGMA_INPUT_BASE,
  FIGMA_INPUT_ICON,
  FIGMA_INPUT_PL8,
  FIGMA_INPUT_PL9,
  FIGMA_INPUT_PR10,
  FIGMA_LABEL,
  FIGMA_LINK_SM,
  FIGMA_LOGIN_HEADER,
  FIGMA_MATCH_ICON,
  FIGMA_REGISTER_FOOTER,
  FIGMA_REGISTER_HEADER,
  FIGMA_REGISTER_SUBTITLE,
  FIGMA_SELECT,
  FIGMA_STRENGTH_CAPTION,
  FIGMA_STRENGTH_ROW,
  FIGMA_TERMS_LABEL,
  FIGMA_TERMS_ROW,
  FIGMA_TOGGLE_BTN,
} from '../../components/Auth/figmaAuthClasses';
import { authPrimaryButtonClass, authInputError, authInputSurface } from '../../components/Auth/authFieldClasses';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useAppStrings } from '../../locales/appStrings';
import authService from '../../services/authService';
import {
  birthYearOptions,
  isBirthDateComplete,
  validateBirthDateParts,
} from '../../utils/birthDateUtils';

const STRENGTH_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#10b981'];

function RegisterPage({ suiteLayout = false } = {}) {
  const navigate = useNavigate();
  const { register } = useAuth();
  const { isDarkMode } = useTheme();
  const { t } = useAppStrings();

  const inputOk = authInputSurface(isDarkMode, { dense: true });
  const inputErr = authInputError(isDarkMode, { dense: true });
  const labelCls = isDarkMode ? 'text-slate-200' : 'text-slate-700';
  const mutedCls = isDarkMode ? 'text-slate-400' : 'text-slate-600';
  const titleCls = isDarkMode ? 'text-white' : 'text-[#0f172a]';
  const linkCyan = isDarkMode ? 'font-semibold text-cyan-400 hover:underline' : 'font-semibold text-cyan-700 hover:underline';
  const chk = isDarkMode
    ? 'mt-0.5 h-[1.125rem] w-[1.125rem] shrink-0 rounded border-slate-600 bg-[#0c1018] text-cyan-500'
    : 'mt-0.5 h-[1.125rem] w-[1.125rem] shrink-0 rounded border-slate-300 text-cyan-600';
  const barEmpty = isDarkMode ? 'bg-slate-700' : 'bg-slate-200';
  const btnPrimary = authPrimaryButtonClass(isDarkMode);

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    birthDay: '',
    birthMonth: '',
    birthYear: '',
    password: '',
    confirmPassword: '',
  });
  const yearOptions = useMemo(() => birthYearOptions(), []);
  const [passwordStrength, setPasswordStrength] = useState(0);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [gatewayTrust, setGatewayTrust] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const t = await authService.checkGatewayTrust();
      if (!cancelled) {
        setGatewayTrust({
          ok: t.gatewayTrustConfigured,
          message: t.message || '',
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const calculatePasswordStrength = (password) => {
    let strength = 0;
    if (password.length >= 8) strength++;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength++;
    if (/\d/.test(password)) strength++;
    if (/[^a-zA-Z0-9]/.test(password)) strength++;
    return strength;
  };

  const handlePasswordChange = (e) => {
    const newPassword = e.target.value;
    setFormData({ ...formData, password: newPassword });
    setPasswordStrength(calculatePasswordStrength(newPassword));
  };

  const getStrengthColor = () => {
    if (passwordStrength === 0) return 'from-slate-400 to-slate-500';
    if (passwordStrength === 1) return 'from-red-500 to-orange-500';
    if (passwordStrength === 2) return 'from-amber-500 to-orange-500';
    if (passwordStrength === 3) return 'from-emerald-500 to-teal-500';
    return 'from-emerald-600 to-teal-600';
  };

  const strengthKeys = ['register.strength0', 'register.strength1', 'register.strength2', 'register.strength3', 'register.strength4'];
  const getStrengthText = () => t(strengthKeys[passwordStrength] ?? strengthKeys[0]);

  const validateForm = () => {
    const newErrors = {};

    if (!formData.lastName || formData.lastName.trim().length < 1) {
      newErrors.lastName = t('register.errLastNameRequired');
    } else if (formData.lastName.trim().length < 2) {
      newErrors.lastName = t('register.errLastNameMin');
    }

    if (!formData.firstName || formData.firstName.trim().length < 1) {
      newErrors.firstName = t('register.errFirstNameRequired');
    } else if (formData.firstName.trim().length < 2) {
      newErrors.firstName = t('register.errFirstNameMin');
    }

    if (!formData.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = t('register.errEmail');
    }

    if (!isBirthDateComplete(formData)) {
      newErrors.birthDate = t('register.errBirthRequired');
    } else {
      const dob = validateBirthDateParts(formData);
      if (!dob.ok) {
        const codeMap = {
          required: 'register.errBirthRequired',
          invalid: 'register.errBirthInvalid',
          future: 'register.errBirthFuture',
          tooYoung: 'register.errBirthTooYoung',
        };
        newErrors.birthDate = t(codeMap[dob.code] || 'register.errBirthInvalid');
      }
    }

    if (!formData.password || formData.password.length < 8) {
      newErrors.password = t('register.errPasswordMin');
    } else if (passwordStrength < 3) {
      newErrors.password = t('register.errPasswordComplex');
    }

    if (!formData.confirmPassword) {
      newErrors.confirmPassword = t('register.errConfirmRequired');
    } else if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = t('register.errConfirmMismatch');
    }

    if (!agreedToTerms) {
      newErrors.terms = t('register.errTerms');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleRegister = async (e) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setLoading(true);

    try {
      const firstName = formData.firstName.trim();
      const lastName = formData.lastName.trim();
      const dob = validateBirthDateParts(formData);
      if (!dob.ok) {
        setErrors({ birthDate: t('register.errBirthInvalid') });
        return;
      }

      const success = await register({
        firstName,
        lastName,
        email: formData.email.trim(),
        password: formData.password,
        dateOfBirth: dob.iso,
      });

      if (success) {
        navigate('/login', {
          state: {
            message: t('register.successMessage'),
          },
        });
      }
    } catch (error) {
      console.error('[RegisterPage] Registration error:', error);
    } finally {
      setLoading(false);
    }
  };

  const registerForm = (
    <>
      <div className={suiteLayout ? FIGMA_REGISTER_HEADER : FIGMA_LOGIN_HEADER}>
        <h1 className="font-display text-foreground mb-1.5">{t('register.title')}</h1>
        <p className={FIGMA_REGISTER_SUBTITLE}>{t('register.subtitle')}</p>
      </div>

      <div className={FIGMA_CENTERED_CARD}>
        {gatewayTrust && !gatewayTrust.ok && (
          <div
            role="alert"
            className="mb-4 rounded-lg border border-warning/40 bg-warning-bg px-4 py-3 text-[0.8125rem] leading-relaxed text-foreground-secondary"
          >
            <p className="font-semibold text-warning">{t('register.gatewayAlertTitle')}</p>
            <p className="mt-1">{gatewayTrust.message || t('register.gatewayAlertFallback')}</p>
          </div>
        )}

      <form className="mt-8 space-y-5" onSubmit={handleRegister}>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <label className={`mb-2.5 block text-base font-semibold ${labelCls}`}>{t('register.lastName')}</label>
            <input
              type="text"
              value={formData.lastName}
              onChange={(e) => {
                setFormData({ ...formData, lastName: e.target.value });
                if (errors.lastName) setErrors({ ...errors, lastName: '' });
              }}
              className={errors.lastName ? inputErr : inputOk}
              placeholder={t('register.placeholderLastName')}
            />
            {errors.lastName && <p className="mt-1.5 text-sm text-red-600 dark:text-red-400">{errors.lastName}</p>}
          </div>

          <div>
            <label className={`mb-2.5 block text-base font-semibold ${labelCls}`}>{t('register.firstName')}</label>
            <input
              type="text"
              value={formData.firstName}
              onChange={(e) => {
                setFormData({ ...formData, firstName: e.target.value });
                if (errors.firstName) setErrors({ ...errors, firstName: '' });
              }}
              className={errors.firstName ? inputErr : inputOk}
              placeholder={t('register.placeholderFirstName')}
            />
            {errors.firstName && <p className="mt-1.5 text-sm text-red-600 dark:text-red-400">{errors.firstName}</p>}
          </div>
        </div>

        <div>
          <label className={`mb-2.5 block text-base font-semibold ${labelCls}`}>{t('register.email')}</label>
          <input
            type="email"
            value={formData.email}
            onChange={(e) => {
              setFormData({ ...formData, email: e.target.value });
              if (errors.email) setErrors({ ...errors, email: '' });
            }}
            className={errors.email ? inputErr : inputOk}
            placeholder={t('register.placeholderEmail')}
          />
          {errors.email && <p className="mt-1.5 text-sm text-red-600 dark:text-red-400">{errors.email}</p>}
        </div>

        <div>
          <label className={`mb-2.5 block text-base font-semibold ${labelCls}`}>{t('register.birthDate')}</label>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <span className={`mb-1 block text-xs font-medium ${mutedCls}`}>{t('register.birthDay')}</span>
              <select
                value={formData.birthDay}
                onChange={(e) => {
                  setFormData({ ...formData, birthDay: e.target.value });
                  if (errors.birthDate) setErrors({ ...errors, birthDate: '' });
                }}
                className={errors.birthDate ? inputErr : inputOk}
                aria-label={t('register.birthDay')}
              >
                <option value="">{t('register.birthDayPlaceholder')}</option>
                {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={String(d)}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <span className={`mb-1 block text-xs font-medium ${mutedCls}`}>{t('register.birthMonth')}</span>
              <select
                value={formData.birthMonth}
                onChange={(e) => {
                  setFormData({ ...formData, birthMonth: e.target.value });
                  if (errors.birthDate) setErrors({ ...errors, birthDate: '' });
                }}
                className={errors.birthDate ? inputErr : inputOk}
                aria-label={t('register.birthMonth')}
              >
                <option value="">{t('register.birthMonthPlaceholder')}</option>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={String(m)}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <span className={`mb-1 block text-xs font-medium ${mutedCls}`}>{t('register.birthYear')}</span>
              <select
                value={formData.birthYear}
                onChange={(e) => {
                  setFormData({ ...formData, birthYear: e.target.value });
                  if (errors.birthDate) setErrors({ ...errors, birthDate: '' });
                }}
                className={errors.birthDate ? inputErr : inputOk}
                aria-label={t('register.birthYear')}
              >
                <option value="">{t('register.birthYearPlaceholder')}</option>
                {yearOptions.map((y) => (
                  <option key={y} value={String(y)}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {errors.birthDate && (
            <p className="mt-1.5 text-sm text-red-600 dark:text-red-400">{errors.birthDate}</p>
          )}
        </div>

        <div>
          <label className={`mb-2.5 block text-base font-semibold ${labelCls}`}>{t('register.password')}</label>
          <input
            type="password"
            value={formData.password}
            onChange={handlePasswordChange}
            className={inputOk}
            placeholder={t('common.passwordPlaceholder')}
          />
          {formData.password && (
            <div className="mt-2">
              <div className="mb-1 flex gap-1">
                {[...Array(4)].map((_, idx) => (
                  <div
                    key={idx}
                    className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                      idx < passwordStrength ? `bg-gradient-to-r ${getStrengthColor()}` : barEmpty
                    }`}
                  />
                ))}
              </div>
              <p
                className={`text-sm font-semibold bg-gradient-to-r ${getStrengthColor()} bg-clip-text text-transparent`}
              >
                {getStrengthText()}
              </p>
            </div>
          )}
          {errors.password && <p className="mt-1.5 text-sm text-red-600 dark:text-red-400">{errors.password}</p>}
        </div>

        <div>
          <label className={`mb-2.5 block text-base font-semibold ${labelCls}`}>{t('register.confirmPassword')}</label>
          <input
            type="password"
            value={formData.confirmPassword}
            onChange={(e) => {
              setFormData({ ...formData, confirmPassword: e.target.value });
              if (errors.confirmPassword) setErrors({ ...errors, confirmPassword: '' });
            }}
            className={errors.confirmPassword ? inputErr : inputOk}
            placeholder={t('common.confirmPasswordPlaceholder')}
          />
          {errors.confirmPassword && (
            <p className="mt-1.5 text-sm text-red-600 dark:text-red-400">{errors.confirmPassword}</p>
          )}
        </div>

        <div>
          <label className={`flex cursor-pointer items-start gap-3 text-base leading-snug ${mutedCls}`}>
            <input
              type="checkbox"
              checked={agreedToTerms}
              onChange={(e) => {
                setAgreedToTerms(e.target.checked);
                if (errors.terms) setErrors({ ...errors, terms: '' });
              }}
              className={`${chk} focus:ring-cyan-600/30`}
            />
            <span>
              {t('register.agreePrefix')}{' '}
              <Link to="/terms-of-service" className={linkCyan}>
                {t('register.termsLink')}
              </Link>{' '}
              {t('register.termsAnd')}{' '}
              <Link to="/privacy-policy" className={linkCyan}>
                {t('register.privacyLink')}
              </Link>
              {t('register.termsSuffix')}
            </span>
          </label>
          {errors.terms && <p className="mt-1.5 text-sm text-red-600 dark:text-red-400">{errors.terms}</p>}
        </div>

          <button
            type="submit"
            disabled={submitDisabled}
            className={`${FIGMA_BTN} ${authPrimaryButtonClass()}`}
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className={FIGMA_BTN_SPINNER} />
                {t('register.submitting')}
              </span>
            ) : gatewayTrust === null ? (
              t('login.checkingConfig')
            ) : (
              t('register.submit')
            )}
          </button>
        </form>

        <div className={FIGMA_REGISTER_FOOTER}>
          {t('register.hasAccount')}{' '}
          <Link to="/login" className={FIGMA_LINK_SM}>
            {t('register.loginCta')}
          </Link>
        </div>
      </div>
    </>
  );

  if (suiteLayout) {
    return (
      <AuthFigmaCenteredLayout maxWidthClass="max-w-[480px]" logoMarginClass="mb-8">
        {registerForm}
      </AuthFigmaCenteredLayout>
    );
  }

  return (
    <AuthFigmaLoginLayout aside={<AuthMarketingAside />}>
      <div className={FIGMA_REGISTER_SPLIT_INNER}>
        <AuthFigmaLoginMobileLogo />
        {registerForm}
      </div>
    </AuthFigmaLoginLayout>
  );
}

export default RegisterPage;
