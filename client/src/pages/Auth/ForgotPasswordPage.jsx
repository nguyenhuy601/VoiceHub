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
  FIGMA_DEV_BOX,
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
  const [devResetUrl, setDevResetUrl] = useState('');

  useEffect(() => {
    const fromQuery = String(searchParams.get('email') || '').trim();
    if (fromQuery) setEmail(fromQuery);
  }, [searchParams]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const normalizedEmail = String(email || '').trim();
    if (!normalizedEmail) {
      toast.error(t('forgotPassword.toastEmailRequired'));
      return;
    }

    setLoading(true);
    try {
      const result = await authService.forgotPassword(normalizedEmail);
      const fallbackUrl = result?.data?.resetUrl || '';
      setDevResetUrl(fallbackUrl);
      setSubmitted(true);
      if (result?.data?.emailScheduled) {
        toast.success(t('forgotPassword.toastSent'));
      } else {
        toast(t('forgotPassword.toastNoSmtp'), { icon: 'ℹ️' });
      }
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('forgotPassword.toastSendErr') }));
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
                />
              </div>

              <button type="submit" disabled={loading} className={`${FIGMA_BTN} ${FIGMA_BTN_PURPLE}`}>
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
          <div className={FIGMA_FORGOT_SUCCESS_INNER}>
            <div className={FIGMA_SUCCESS_ICON}>
              <CheckCircle2 size={32} className="text-success" aria-hidden />
            </div>
            <h2 className="font-display text-foreground mb-3">{t('forgotPassword.title')}</h2>
            <p className={`${FIGMA_CARD_SUBTITLE} leading-[1.6]`}>{t('forgotPassword.successBody')}</p>
            {email.trim() && (
              <p className="mt-2 text-[0.9rem] font-semibold text-violet-300">{email.trim()}</p>
            )}
            {devResetUrl && (
              <div className={FIGMA_DEV_BOX}>
                <p className="text-[0.75rem] text-success mb-1">{t('forgotPassword.devSmtpHint')}</p>
                <a href={devResetUrl} className="text-[0.7rem] text-success break-all font-mono">
                  {devResetUrl}
                </a>
              </div>
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
