import { useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowRight, CheckCircle2, LogIn, Mail } from 'lucide-react';
import AuthPageLayout from '../../components/Auth/AuthPageLayout';
import AuthMarketingAside from '../../components/Auth/AuthMarketingAside';
import { authInputSurface, authPrimaryButtonClass } from '../../components/Auth/authFieldClasses';
import { useTheme } from '../../context/ThemeContext';
import authService from '../../services/authService';

function ForgotPasswordPage() {
  const { isDarkMode } = useTheme();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [devResetUrl, setDevResetUrl] = useState('');

  const inputBase = authInputSurface(isDarkMode);
  const btnPrimary = authPrimaryButtonClass(isDarkMode);
  const titleCls = isDarkMode ? 'text-white' : 'text-[#0f172a]';
  const mutedCls = isDarkMode ? 'text-slate-400' : 'text-slate-600';
  const linkCyan = isDarkMode ? 'font-semibold text-cyan-400 hover:underline' : 'font-semibold text-cyan-700 hover:underline';
  const successBox = isDarkMode
    ? 'rounded-xl border border-cyan-500/25 bg-cyan-500/[0.08] p-4 text-sm text-cyan-100'
    : 'rounded-xl border border-cyan-200/80 bg-cyan-50/90 p-4 text-sm text-cyan-950';
  const devBox = isDarkMode
    ? 'mt-3 rounded-lg border border-cyan-400/30 bg-slate-900/60 p-3'
    : 'mt-3 rounded-lg border border-cyan-300/60 bg-white/80 p-3';

  const handleSubmit = async (event) => {
    event.preventDefault();
    const normalizedEmail = String(email || '').trim();
    if (!normalizedEmail) {
      toast.error('Vui lòng nhập email');
      return;
    }

    setLoading(true);
    try {
      const result = await authService.forgotPassword(normalizedEmail);
      const fallbackUrl = result?.data?.resetUrl || '';
      if (fallbackUrl) {
        setDevResetUrl(fallbackUrl);
      } else {
        setDevResetUrl('');
      }
      setSubmitted(true);
      if (result?.data?.emailScheduled) {
        toast.success('Đã gửi hướng dẫn đặt lại mật khẩu đến email của bạn');
      } else {
        toast('Email service chưa cấu hình SMTP, đang dùng chế độ local.', { icon: 'ℹ️' });
      }
    } catch (error) {
      const message = error?.message || 'Không thể gửi email đặt lại mật khẩu';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthPageLayout aside={<AuthMarketingAside />}>
      <div className="mb-1 flex justify-end">
        <Link
          to="/login"
          className={`inline-flex items-center gap-2 text-base font-semibold transition ${linkCyan}`}
        >
          <LogIn className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
          Đăng nhập
        </Link>
      </div>

      <div className="mt-3 flex items-start gap-3">
        <div
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${
            isDarkMode ? 'bg-cyan-500/15 text-cyan-300' : 'bg-cyan-100 text-cyan-700'
          }`}
        >
          <Mail className="h-6 w-6" strokeWidth={1.75} aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className={`text-[1.65rem] font-bold tracking-tight sm:text-[1.85rem] ${titleCls}`}>Quên mật khẩu</h1>
          <p className={`mt-2 text-base leading-relaxed sm:text-lg ${mutedCls}`}>
            Nhập email đã đăng ký, chúng tôi sẽ gửi liên kết để bạn đặt lại mật khẩu.
          </p>
        </div>
      </div>

      {!submitted ? (
        <form onSubmit={handleSubmit} className="mt-8 space-y-6">
          <div>
            <label htmlFor="email" className={`mb-2.5 block text-base font-semibold ${isDarkMode ? 'text-slate-200' : 'text-slate-700'}`}>
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className={inputBase}
              placeholder="dodanh@gmail.com"
              autoComplete="email"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className={`flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-lg font-bold text-white shadow-lg transition disabled:cursor-not-allowed disabled:opacity-60 ${btnPrimary}`}
          >
            {loading ? 'Đang gửi yêu cầu…' : 'Gửi liên kết đặt lại'}
            {!loading && <ArrowRight className="h-5 w-5" strokeWidth={2} aria-hidden />}
          </button>
        </form>
      ) : (
        <div className={`mt-8 ${successBox}`}>
          <div className="flex gap-3">
            <CheckCircle2
              className={`mt-0.5 h-5 w-5 shrink-0 sm:h-6 sm:w-6 ${isDarkMode ? 'text-cyan-400' : 'text-cyan-600'}`}
              strokeWidth={2}
              aria-hidden
            />
            <p className="text-base leading-relaxed">
              Yêu cầu đã được gửi. Vui lòng kiểm tra email và làm theo hướng dẫn để đặt lại mật khẩu.
            </p>
          </div>
          {devResetUrl && (
            <div className={devBox}>
              <p className={`mb-2 text-sm ${isDarkMode ? 'text-cyan-200/90' : 'text-slate-700'}`}>
                Môi trường local chưa cấu hình SMTP. Bạn có thể dùng link test sau:
              </p>
              <a href={devResetUrl} className={`break-all text-sm font-semibold ${linkCyan}`}>
                {devResetUrl}
              </a>
            </div>
          )}
        </div>
      )}

      <Link
        to="/"
        className={`mt-8 flex items-center justify-center gap-2 text-base font-medium transition ${mutedCls} hover:text-cyan-600 dark:hover:text-cyan-300`}
      >
        Về trang chủ
      </Link>
    </AuthPageLayout>
  );
}

export default ForgotPasswordPage;
