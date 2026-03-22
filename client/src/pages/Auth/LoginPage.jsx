import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { GradientButton } from '../../components/Shared';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';

function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // Hiển thị thông báo từ state (khi redirect từ register hoặc verify email)
  useEffect(() => {
    if (location.state?.message) {
      toast.success(location.state.message);
      // Clear state để không hiển thị lại khi reload
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validate
    if (!formData.email || !formData.password) {
      return;
    }

    setLoading(true);
    try {
      const success = await login(formData.email, formData.password);
      if (success) {
        navigate('/dashboard');
      }
    } catch (error) {
      console.error('Login error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-[#020817] text-slate-100 overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-20 -left-20 h-[22rem] w-[22rem] rounded-full border border-cyan-500/20 bg-cyan-500/10 blur-2xl animate-pulse-slow" />
        <div className="absolute top-20 left-1/3 h-56 w-[20rem] rounded-[48%] border border-sky-500/20 bg-sky-500/10 blur-2xl animate-pulse-slow" style={{ animationDelay: '0.4s' }} />
        <div className="absolute -bottom-16 left-8 h-[18rem] w-[18rem] rounded-full border border-blue-500/20 bg-blue-500/10 blur-2xl animate-pulse-slow" style={{ animationDelay: '0.8s' }} />
      </div>

      <div className="relative z-10 grid min-h-screen lg:grid-cols-2">
        <section className="hidden lg:flex flex-col justify-between border-r border-slate-800/80 px-10 py-12 xl:px-12">
          <div className="animate-slideUp" style={{ animationDelay: '0.05s' }}>
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 shadow-[0_0_24px_rgba(14,165,233,0.35)]">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.25a5.25 5.25 0 005.25-5.25V8.5a5.25 5.25 0 10-10.5 0V13A5.25 5.25 0 0012 18.25zm0 0v2.25m-4-2.25h8" />
              </svg>
            </div>
            <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-500/10 px-3 py-1 text-xs font-semibold text-cyan-200">
              <span className="h-2 w-2 rounded-full bg-cyan-300" />
              Nền tảng giao tiếp doanh nghiệp thời gian thực
            </div>
          </div>

          <div className="max-w-md animate-slideUp" style={{ animationDelay: '0.15s' }}>
            <h1 className="text-5xl font-extrabold tracking-tight font-['Space_Grotesk']">Vortex</h1>
            <p className="mt-4 text-2xl leading-tight text-slate-300">
              Giao tiếp doanh nghiệp trực quan, phản hồi tức thì và vận hành mạnh mẽ.
            </p>
            <p className="mt-3 text-sm text-slate-400">
              Một nơi duy nhất cho chat đội nhóm, họp thoại và phối hợp công việc liên phòng ban.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm text-slate-300 animate-slideUp" style={{ animationDelay: '0.25s' }}>
            <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-3">Kênh chat bảo mật</div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-3">Gọi thoại độ trễ thấp</div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-3">Quản trị vai trò RBAC</div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-3">Theo dõi hoạt động tức thì</div>
          </div>
        </section>

        <section className="flex items-center justify-center px-5 py-10 sm:px-8 lg:px-12">
          <div className="w-full max-w-lg rounded-2xl border border-cyan-500/20 bg-gradient-to-b from-[#07122f]/90 to-[#030b1f]/95 p-6 shadow-[0_14px_40px_rgba(2,8,23,0.62)] backdrop-blur-xl animate-slideUp sm:p-8">
            <div className="mb-2 text-right text-sm text-slate-400">
              Chưa có tài khoản?{' '}
              <Link to="/register" className="font-semibold text-cyan-400 hover:text-cyan-300 transition-colors">Tạo ngay</Link>
            </div>

            <h2 className="mt-4 text-3xl font-bold text-white">Chào mừng trở lại</h2>
            <p className="mt-2 text-base text-slate-400">Nhập thông tin đăng nhập để truy cập không gian làm việc của bạn.</p>

            <form onSubmit={handleSubmit} className="mt-7 space-y-5">
              <div>
                <label htmlFor="email" className="mb-2 block text-sm font-semibold text-slate-200">Email</label>
                <input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full rounded-xl border border-slate-800 bg-[#040f2a] px-4 py-3 text-sm text-white placeholder:text-slate-500 transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/40"
                  placeholder="tenban@congty.com"
                />
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label htmlFor="password" className="block text-sm font-semibold text-slate-200">Mật khẩu</label>
                  <Link to="/forgot-password" className="text-sm font-semibold text-cyan-400 hover:text-cyan-300 transition-colors">Quên mật khẩu?</Link>
                </div>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full rounded-xl border border-slate-800 bg-[#040f2a] px-4 py-3 pr-14 text-sm text-white placeholder:text-slate-500 transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/40"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-400 hover:text-slate-200"
                  >
                    {showPassword ? 'Ẩn' : 'Hiện'}
                  </button>
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm text-slate-400">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-cyan-500"
                />
                Ghi nhớ thiết bị này
              </label>

              <GradientButton
                variant="primary"
                className="w-full justify-center rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 py-3 text-base font-bold hover:from-cyan-400 hover:to-blue-500"
                type="submit"
                disabled={loading}
              >
                {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
              </GradientButton>

              <p className="text-center text-xs text-slate-500">
                Phiên làm việc được mã hóa và bảo vệ theo chuẩn doanh nghiệp.
              </p>
            </form>

            <Link to="/" className="mt-7 block text-center text-sm text-slate-500 hover:text-slate-300 transition-colors">
              Về Trang Chủ
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}

export default LoginPage;
