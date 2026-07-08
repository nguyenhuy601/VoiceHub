import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowRight, Loader2, Sparkles } from 'lucide-react';
import AuthPageLayout from '../../components/Auth/AuthPageLayout';
import AuthMarketingAside from '../../components/Auth/AuthMarketingAside';
import { authPrimaryButtonClass } from '../../components/Auth/authFieldClasses';
import { useTheme } from '../../context/ThemeContext';
import { organizationAPI } from '../../services/api/organizationAPI';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { stashOneTimeLoginCredentials } from '../../utils/oneTimeLoginCredentials';

const unwrap = (payload) => payload?.data ?? payload;

export default function AcceptCompanyInvitePage() {
  const navigate = useNavigate();
  const { isDarkMode } = useTheme();
  const { t } = useAppStrings();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const hasRunRef = useRef(false);
  const [phase, setPhase] = useState('creating'); // creating | done | error
  const [errorMessage, setErrorMessage] = useState('');

  const btnPrimary = authPrimaryButtonClass(isDarkMode);
  const titleCls = isDarkMode ? 'text-white' : 'text-[#0f172a]';
  const mutedCls = isDarkMode ? 'text-slate-400' : 'text-slate-600';
  const iconWrap = isDarkMode ? 'bg-cyan-500/15 text-cyan-300' : 'bg-cyan-100 text-cyan-700';

  useEffect(() => {
    if (!token) {
      toast.error(t('acceptCompanyInvite.toastNoToken'));
      navigate('/login', { replace: true, state: { error: t('acceptCompanyInvite.toastNoToken') } });
      return;
    }
    if (hasRunRef.current) return;
    hasRunRef.current = true;

    (async () => {
      setPhase('creating');
      try {
        const res = await organizationAPI.acceptCompanyInvite(token);
        const payload = unwrap(res);
        const data = payload?.data ?? payload;
        const email = String(data?.email || '').trim().toLowerCase();
        const temporaryPassword = String(data?.temporaryPassword || '');

        if (email && temporaryPassword) {
          stashOneTimeLoginCredentials({ email, password: temporaryPassword });
        }

        setPhase('done');
        toast.success(data?.alreadyHadAccount
          ? t('acceptCompanyInvite.toastExisting')
          : t('acceptCompanyInvite.toastCreated'));

        setTimeout(() => {
          navigate('/login', {
            replace: true,
            state: {
              fromCompanyInvite: true,
              message: temporaryPassword
                ? t('acceptCompanyInvite.loginFlashCredentials')
                : t('acceptCompanyInvite.loginFlashReady'),
              prefillEmail: email,
            },
          });
        }, 900);
      } catch (error) {
        const msg = resolveApiErrorMessage(error, {
          t,
          fallback: t('acceptCompanyInvite.createFailed'),
        });
        setErrorMessage(msg);
        setPhase('error');
        toast.error(msg);
      }
    })();
  }, [token, navigate, t]);

  return (
    <AuthPageLayout aside={<AuthMarketingAside />}>
      <div className="flex flex-col items-center text-center">
        <div className={`relative flex h-16 w-16 items-center justify-center rounded-2xl ${iconWrap}`}>
          {phase === 'creating' ? (
            <Loader2 className="h-8 w-8 animate-spin" strokeWidth={1.75} aria-hidden />
          ) : (
            <Sparkles className="h-8 w-8" strokeWidth={1.75} aria-hidden />
          )}
        </div>
        <h1 className={`mt-6 text-[1.65rem] font-bold tracking-tight sm:text-[1.85rem] ${titleCls}`}>
          {phase === 'error'
            ? t('acceptCompanyInvite.titleError')
            : phase === 'done'
              ? t('acceptCompanyInvite.titleDone')
              : t('acceptCompanyInvite.titleCreating')}
        </h1>
        <p className={`mt-3 max-w-md text-base leading-relaxed sm:text-lg ${mutedCls}`}>
          {phase === 'error'
            ? errorMessage
            : phase === 'done'
              ? t('acceptCompanyInvite.bodyDone')
              : t('acceptCompanyInvite.bodyCreating')}
        </p>
        {phase === 'creating' ? (
          <div
            className={`mx-auto mt-6 h-1.5 w-44 overflow-hidden rounded-full ${
              isDarkMode ? 'bg-slate-700' : 'bg-slate-200'
            }`}
          >
            <div
              className={`h-full w-1/2 animate-[pulse_1.4s_ease-in-out_infinite] rounded-full bg-gradient-to-r ${
                isDarkMode ? 'from-cyan-500 to-teal-500' : 'from-cyan-500 to-sky-500'
              }`}
            />
          </div>
        ) : null}
        {phase === 'error' ? (
          <Link
            to="/login"
            className={`mt-8 inline-flex items-center justify-center gap-2 rounded-2xl px-8 py-4 text-lg font-bold text-white shadow-lg transition ${btnPrimary}`}
          >
            {t('acceptCompanyInvite.ctaLogin')}
            <ArrowRight className="h-5 w-5" strokeWidth={2} aria-hidden />
          </Link>
        ) : null}
      </div>
    </AuthPageLayout>
  );
}
