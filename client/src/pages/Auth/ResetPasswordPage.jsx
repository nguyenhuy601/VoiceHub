import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { GradientButton } from '../../components/Shared';
import authService from '../../services/authService';

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';

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

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!token) {
      toast.error('Liên kết không hợp lệ hoặc đã hết hạn');
      return;
    }
    if (password.length < 8) {
      toast.error('Mật khẩu phải có ít nhất 8 ký tự');
      return;
    }
    if (password !== confirmPassword) {
      toast.error('Mật khẩu xác nhận không khớp');
      return;
    }

    setLoading(true);
    try {
      await authService.resetPassword(token, password);
      toast.success('Đặt lại mật khẩu thành công');
      navigate('/login', {
        state: { message: 'Mật khẩu đã được cập nhật. Bạn có thể đăng nhập ngay.' },
      });
    } catch (error) {
      const message = error?.message || 'Không thể đặt lại mật khẩu';
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
          <h1 className="mt-1 text-3xl font-bold text-white">Đặt lại mật khẩu</h1>
          <p className="mt-2 text-base text-slate-400">
            Tạo mật khẩu mới để bảo vệ tài khoản của bạn.
          </p>

          <form onSubmit={handleSubmit} className="mt-7 space-y-5">
            <div>
              <label htmlFor="password" className="mb-2 block text-sm font-semibold text-slate-200">Mật khẩu mới</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-xl border border-slate-800 bg-[#040f2a] px-4 py-3 text-sm text-white placeholder:text-slate-500 transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/40"
                placeholder="••••••••"
              />
              {password && (
                <div className="mt-2 flex gap-1">
                  {[0, 1, 2, 3].map((slot) => (
                    <div
                      key={slot}
                      className={`h-1.5 flex-1 rounded-full ${slot < passwordStrength ? 'bg-gradient-to-r from-cyan-500 to-blue-600' : 'bg-slate-800'}`}
                    />
                  ))}
                </div>
              )}
            </div>

            <div>
              <label htmlFor="confirmPassword" className="mb-2 block text-sm font-semibold text-slate-200">Xác nhận mật khẩu mới</label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="w-full rounded-xl border border-slate-800 bg-[#040f2a] px-4 py-3 text-sm text-white placeholder:text-slate-500 transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/40"
                placeholder="••••••••"
              />
            </div>

            <GradientButton
              variant="primary"
              className="w-full justify-center rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 py-3 text-base font-bold hover:from-cyan-400 hover:to-blue-500"
              type="submit"
              disabled={loading}
            >
              {loading ? 'Đang cập nhật...' : 'Cập nhật mật khẩu'}
            </GradientButton>
          </form>

          <Link to="/login" className="mt-7 block text-center text-sm text-slate-500 hover:text-slate-300 transition-colors">
            Quay lại đăng nhập
          </Link>
        </div>
      </div>
    </div>
  );
}

export default ResetPasswordPage;