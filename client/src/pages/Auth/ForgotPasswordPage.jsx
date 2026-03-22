import { useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { GradientButton } from '../../components/Shared';
import authService from '../../services/authService';

function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [devResetUrl, setDevResetUrl] = useState('');

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
    <div className="relative min-h-screen bg-[#020817] text-slate-100 overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-20 -left-20 h-[22rem] w-[22rem] rounded-full border border-cyan-500/20 bg-cyan-500/10 blur-2xl animate-pulse-slow" />
        <div className="absolute top-20 left-1/3 h-56 w-[20rem] rounded-[48%] border border-sky-500/20 bg-sky-500/10 blur-2xl animate-pulse-slow" style={{ animationDelay: '0.5s' }} />
      </div>

      <div className="relative z-10 flex min-h-screen items-center justify-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-lg rounded-2xl border border-cyan-500/20 bg-gradient-to-b from-[#07122f]/90 to-[#030b1f]/95 p-6 shadow-[0_14px_40px_rgba(2,8,23,0.62)] backdrop-blur-xl animate-slideUp sm:p-8">
          <div className="mb-2 text-right text-sm text-slate-400">
            Đã nhớ mật khẩu?{' '}
            <Link to="/login" className="font-semibold text-cyan-400 hover:text-cyan-300 transition-colors">Đăng nhập</Link>
          </div>

          <h1 className="mt-4 text-3xl font-bold text-white">Quên mật khẩu</h1>
          <p className="mt-2 text-base text-slate-400">
            Nhập email đã đăng ký, chúng tôi sẽ gửi liên kết để bạn đặt lại mật khẩu.
          </p>

          {!submitted ? (
            <form onSubmit={handleSubmit} className="mt-7 space-y-5">
              <div>
                <label htmlFor="email" className="mb-2 block text-sm font-semibold text-slate-200">Email</label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="w-full rounded-xl border border-slate-800 bg-[#040f2a] px-4 py-3 text-sm text-white placeholder:text-slate-500 transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/40"
                  placeholder="tenban@congty.com"
                />
              </div>

              <GradientButton
                variant="primary"
                className="w-full justify-center rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 py-3 text-base font-bold hover:from-cyan-400 hover:to-blue-500"
                type="submit"
                disabled={loading}
              >
                {loading ? 'Đang gửi yêu cầu...' : 'Gửi liên kết đặt lại'}
              </GradientButton>
            </form>
          ) : (
            <div className="mt-7 rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-4 text-sm text-cyan-100">
              Yêu cầu đã được gửi. Vui lòng kiểm tra email và làm theo hướng dẫn để đặt lại mật khẩu.
              {devResetUrl && (
                <div className="mt-3 rounded-lg border border-cyan-400/40 bg-[#031126] p-3">
                  <p className="mb-2 text-xs text-cyan-200">
                    Môi trường local chưa cấu hình SMTP. Bạn có thể dùng link test sau:
                  </p>
                  <a href={devResetUrl} className="break-all text-xs font-semibold text-cyan-300 hover:text-cyan-200">
                    {devResetUrl}
                  </a>
                </div>
              )}
            </div>
          )}

          <Link to="/" className="mt-7 block text-center text-sm text-slate-500 hover:text-slate-300 transition-colors">
            Về Trang Chủ
          </Link>
        </div>
      </div>
    </div>
  );
}

export default ForgotPasswordPage;