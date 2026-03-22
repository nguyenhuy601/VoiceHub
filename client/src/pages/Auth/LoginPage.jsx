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
        <div className="absolute -top-20 -left-20 h-[22rem] w-[22rem] rounded-full border border-indigo-500/20 bg-indigo-500/10 blur-2xl" />
        <div className="absolute top-20 left-1/3 h-56 w-[20rem] rounded-[48%] border border-blue-500/20 bg-blue-500/10 blur-2xl" />
        <div className="absolute -bottom-16 left-8 h-[18rem] w-[18rem] rounded-full border border-violet-500/20 bg-violet-500/10 blur-2xl" />
      </div>

      <div className="relative z-10 grid min-h-screen lg:grid-cols-2">
        <section className="hidden lg:flex flex-col justify-between border-r border-slate-800/80 px-10 py-12 xl:px-12">
          <div>
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 shadow-[0_0_24px_rgba(99,102,241,0.35)]">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.25a5.25 5.25 0 005.25-5.25V8.5a5.25 5.25 0 10-10.5 0V13A5.25 5.25 0 0012 18.25zm0 0v2.25m-4-2.25h8" />
              </svg>
            </div>
          </div>

          <div className="max-w-md">
            <h1 className="text-5xl font-extrabold tracking-tight">Vortex</h1>
            <p className="mt-4 text-2xl leading-tight text-slate-300">
              Enterprise communication that feels intuitive, real-time, and powerful.
            </p>
          </div>

          <div className="h-8" />
        </section>

        <section className="flex items-center justify-center px-5 py-10 sm:px-8 lg:px-12">
          <div className="w-full max-w-lg rounded-2xl border border-slate-800/80 bg-[#020a1f]/85 p-6 shadow-[0_12px_32px_rgba(2,8,23,0.6)] backdrop-blur-xl sm:p-8">
            <div className="mb-2 text-right text-sm text-slate-400">
              Chưa có tài khoản?{' '}
              <Link to="/register" className="font-semibold text-indigo-400 hover:text-indigo-300 transition-colors">Tạo ngay</Link>
            </div>

            <h2 className="mt-4 text-3xl font-bold text-white">Welcome back</h2>
            <p className="mt-2 text-base text-slate-400">Enter your credentials to access your workspace.</p>

            <form onSubmit={handleSubmit} className="mt-7 space-y-5">
              <div>
                <label htmlFor="email" className="mb-2 block text-sm font-semibold text-slate-200">Email</label>
                <input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full rounded-xl border border-slate-800 bg-[#040f2a] px-4 py-3 text-sm text-white placeholder:text-slate-500 transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/40"
                  placeholder="name@company.com"
                />
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label htmlFor="password" className="block text-sm font-semibold text-slate-200">Password</label>
                  <a href="#" className="text-sm font-semibold text-indigo-400 hover:text-indigo-300 transition-colors">Forgot password?</a>
                </div>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full rounded-xl border border-slate-800 bg-[#040f2a] px-4 py-3 pr-14 text-sm text-white placeholder:text-slate-500 transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/40"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-400 hover:text-slate-200"
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm text-slate-400">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-indigo-500"
                />
                Remember this device
              </label>

              <GradientButton
                variant="primary"
                className="w-full justify-center rounded-xl bg-gradient-to-r from-violet-500 to-indigo-500 py-3 text-base font-bold hover:from-violet-400 hover:to-indigo-400"
                type="submit"
                disabled={loading}
              >
                {loading ? 'Signing in...' : 'Sign in'}
              </GradientButton>
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
