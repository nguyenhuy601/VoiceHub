import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowLeft, CheckCircle2, Mail } from 'lucide-react';
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
  FIGMA_FORGOT_SUCCESS_INNER,
  FIGMA_FORM_SPACE_5,
  FIGMA_INPUT_BASE,
  FIGMA_INPUT_PL9,
  FIGMA_LABEL,
  FIGMA_LINK_BACK,
  FIGMA_SUCCESS_ICON,
} from '../../components/Auth/figmaAuthClasses';
import authService from '../../services/authService';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';

function ForgotPasswordPage() {
  const { t } = useAppStrings();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    const fromQuery = String(searchParams.get('email') || '').trim();
    if (fromQuery) setEmail(fromQuery);
  }, [searchParams]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const normalizedEmail = String(email || '').trim();
    if (!normalizedEmail) {
      toast.error(t('forgotPassword.toastEmailRequired'), { id: 'forgot-password-flash' });
      return;
    }

    setLoading(true);
    try {
      await authService.forgotPassword(normalizedEmail);
      setSubmitted(true);
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('forgotPassword.toastSendErr') }), {
        id: 'forgot-password-flash',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthFigmaCenteredLayout maxWidthClass="max-w-[400px]" logoMarginClass="mb-10" purpleBrand gradientBackground>
      <div className={FIGMA_CENTERED_CARD}>
        {!submitted ? (
          <>
            <div className={FIGMA_CARD_ICON_HEADER}>
              <div className={FIGMA_CARD_ICON_WRAP_PURPLE}>
                <Mail size={24} className="text-violet-400" aria-hidden />
              </div>
              <h1 className="font-display text-foreground mb-2">{t('forgotPassword.title')}</h1>
              <p className={FIGMA_CARD_SUBTITLE}>{t('forgotPassword.subtitle')}</p>
            </div>

            <form onSubmit={handleSubmit} className={FIGMA_FORM_SPACE_5}>
              <div className={FIGMA_FIELD_GROUP}>
                <label htmlFor="email" className={FIGMA_LABEL}>
                  {t('common.email')}
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className={`${FIGMA_INPUT_BASE} ${FIGMA_INPUT_PL9}`}
                  placeholder={t('forgotPassword.placeholderEmail')}
                  autoComplete="email"
                  maxLength={254}
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className={`${FIGMA_BTN} ${FIGMA_BTN_PURPLE} motion-safe:transition-colors motion-reduce:transition-none`}
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className={FIGMA_BTN_SPINNER} />
                    {t('forgotPassword.sending')}
                  </span>
                ) : (
                  t('forgotPassword.sendLink')
                )}
              </button>
            </form>
          </>
        ) : (
          <div className={FIGMA_FORGOT_SUCCESS_INNER} role="status" aria-live="polite">
            <div className={FIGMA_SUCCESS_ICON}>
              <CheckCircle2 size={32} className="text-success" aria-hidden />
            </div>
            <h2 className="font-display text-foreground mb-3">{t('forgotPassword.title')}</h2>
            <p className={`${FIGMA_CARD_SUBTITLE} leading-[1.6]`}>{t('forgotPassword.sentNeutral')}</p>
            {email.trim() && (
              <p className="mt-2 text-[0.9rem] font-semibold text-violet-300 break-all">{email.trim()}</p>
            )}
          </div>
        )}

        <Link to="/login" className={`mt-8 ${FIGMA_LINK_BACK} justify-center`}>
          <ArrowLeft size={16} aria-hidden />
          {t('common.backHome')}
        </Link>
      </div>
    </AuthFigmaCenteredLayout>
  );
}

export default ForgotPasswordPage;
