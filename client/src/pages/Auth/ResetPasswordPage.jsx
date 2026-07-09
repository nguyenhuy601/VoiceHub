import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { CheckCircle2, Lock } from 'lucide-react';
import AuthFigmaCenteredLayout from '../../components/Auth/AuthFigmaCenteredLayout';
import {
  FIGMA_BTN,
  FIGMA_BTN_PURPLE,
  FIGMA_BTN_SPINNER,
  FIGMA_CARD_ICON_HEADER,
  FIGMA_CARD_ICON_WRAP_PURPLE,
  FIGMA_CARD_SUBTITLE,
  FIGMA_CENTERED_CARD,
  FIGMA_FIELD_GROUP,
  FIGMA_FORM_SPACE_5,
  FIGMA_INPUT_BASE,
  FIGMA_LABEL,
  FIGMA_REGISTER_FOOTER,
  FIGMA_STRENGTH_ROW,
} from '../../components/Auth/figmaAuthClasses';
import authService from '../../services/authService';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { readAuthTokenFromUrl } from '../../utils/authUrlToken';

function ResetPasswordPage() {
  const navigate = useNavigate();
  const { t } = useAppStrings();
  const [searchParams] = useSearchParams();
  const token = readAuthTokenFromUrl(searchParams);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const passwordStrength = useMemo(() => {
    let score = 0;
    if (password.length >= 8) score += 1;
    if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1;
    if (/\d/.test(password)) score += 1;
    if (/[^a-zA-Z0-9]/.test(password)) score += 1;
    return score;
  }, [password]);

  const passwordsMatch = password.length >= 8 && password === confirmPassword;

  const getStrengthColor = () => {
    if (passwordStrength === 0) return 'from-slate-400 to-slate-500';
    if (passwordStrength === 1) return 'from-red-500 to-orange-500';
    if (passwordStrength === 2) return 'from-amber-500 to-orange-500';
    if (passwordStrength === 3) return 'from-emerald-500 to-teal-500';
    return 'from-emerald-600 to-teal-600';
  };

  const barEmpty = 'bg-muted';

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!token) {
      toast.error(t('resetPassword.toastInvalidToken'));
      return;
    }
    if (password.length < 8) {
      toast.error(t('resetPassword.toastPasswordMin'));
      return;
    }
    if (password !== confirmPassword) {
      toast.error(t('resetPassword.toastConfirmMismatch'));
      return;
    }

    setLoading(true);
    try {
      await authService.resetPassword(token, password);
      toast.success(t('resetPassword.toastSuccess'));
      navigate('/login', {
        state: { message: t('resetPassword.loginFlashMessage') },
      });
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('resetPassword.toastResetErr') }));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthFigmaCenteredLayout maxWidthClass="max-w-[400px]" logoMarginClass="mb-10" purpleBrand gradientBackground>
      <div className={FIGMA_CENTERED_CARD}>
        <div className={FIGMA_CARD_ICON_HEADER}>
          <div className={FIGMA_CARD_ICON_WRAP_PURPLE}>
            <Lock size={24} className="text-violet-400" aria-hidden />
          </div>
          <h1 className="font-display text-foreground mb-2">{t('resetPassword.title')}</h1>
          <p className={FIGMA_CARD_SUBTITLE}>{t('resetPassword.subtitle')}</p>
        </div>

      <form onSubmit={handleSubmit} className={FIGMA_FORM_SPACE_5}>
        <div className={FIGMA_FIELD_GROUP}>
          <label htmlFor="password" className={FIGMA_LABEL}>
            {t('resetPassword.newPassword')}
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className={FIGMA_INPUT_BASE}
            placeholder={t('common.passwordPlaceholder')}
            autoComplete="new-password"
          />
          {password && (
            <div className="mt-2">
              <div className={`${FIGMA_STRENGTH_ROW} mb-1`}>
                {[0, 1, 2, 3].map((slot) => (
                  <div
                    key={slot}
                    className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                      slot < passwordStrength ? `bg-gradient-to-r ${getStrengthColor()}` : barEmpty
                    }`}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        <div className={FIGMA_FIELD_GROUP}>
          <label htmlFor="confirmPassword" className={FIGMA_LABEL}>
            {t('resetPassword.confirmNewPassword')}
          </label>
          <input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            className={FIGMA_INPUT_BASE}
            placeholder={t('common.confirmPasswordPlaceholder')}
            autoComplete="new-password"
          />
        </div>

          <button
            type="submit"
            disabled={loading || !passwordsMatch}
            className={`${FIGMA_BTN} ${passwordsMatch ? FIGMA_BTN_PURPLE : 'bg-muted text-muted-foreground'}`}
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className={FIGMA_BTN_SPINNER} />
                {t('resetPassword.updating')}
              </span>
            ) : (
              t('resetPassword.update')
            )}
          </button>
        </form>

        <div className={FIGMA_REGISTER_FOOTER}>
          <Link to="/login" className="text-[0.875rem] text-muted-foreground hover:text-violet-400">
            {t('resetPassword.backToLogin')}
          </Link>
        </div>
      </div>
    </AuthFigmaCenteredLayout>
  );
}

export default ResetPasswordPage;
