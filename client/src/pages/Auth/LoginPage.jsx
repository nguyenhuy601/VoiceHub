import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { GlassCard, GradientButton } from '../../components/Shared';

function LoginPage() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    navigate('/dashboard');
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-8 lg:p-12 relative overflow-hidden">
      {/* Animated Background */}
      <div className="absolute top-20 left-20 w-[500px] h-[500px] bg-purple-600/20 rounded-full blur-3xl animate-float"></div>
      <div className="absolute bottom-20 right-20 w-[500px] h-[500px] bg-pink-600/20 rounded-full blur-3xl animate-float" style={{animationDelay: '1s'}}></div>
      <div className="absolute top-1/2 left-1/3 w-[400px] h-[400px] bg-blue-600/10 rounded-full blur-3xl animate-float" style={{animationDelay: '2s'}}></div>
      
      <div className="relative z-10 w-full max-w-7xl animate-scaleIn">
        <div className="grid lg:grid-cols-2 gap-12 items-center min-h-[600px]">
        {/* Left Side - Info */}
        <div className="hidden lg:block">
          <GlassCard className="glass-strong p-10">
            <div className="text-7xl mb-8 animate-float">🚀</div>
            <h2 className="text-5xl font-black text-gradient mb-6 leading-tight">Hệ Thống Giao Tiếp Doanh Nghiệp</h2>
            <p className="text-gray-300 mb-8 text-xl leading-relaxed">Kết nối toàn bộ tổ chức và nhân viên trong một không gian làm việc thống nhất</p>
            <div className="space-y-6">
              {[
                { icon: "💬", title: "Nhắn tin tức thời", desc: "Giao tiếp nhanh chóng với đồng nghiệp" },
                { icon: "🎤", title: "Cuộc Họp Trực Tuyến", desc: "Voice và Video chất lượng cao 4K" },
                { icon: "✅", title: "Quản lý công việc", desc: "Theo dõi task hiệu quả" },
                { icon: "🔒", title: "Bảo mật tuyệt đối", desc: "Mã hóa end-to-end" }
              ].map((item, idx) => (
                <div key={idx} className="flex items-start gap-4 p-4 glass rounded-xl hover:bg-white/5 transition-all">
                  <div className="text-4xl">{item.icon}</div>
                  <div>
                    <h3 className="text-white font-bold text-lg mb-1">{item.title}</h3>
                    <p className="text-gray-400 text-base">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>
        </div>
        
        {/* Right Side - Login Form */}
        <div>
        <GlassCard className="glass-strong p-10">
          {/* Logo and Title */}
          <div className="text-center mb-10">
            <div className="relative inline-block mb-6">
              <div className="text-7xl">🔐</div>
              <div className="absolute -top-1 -right-1 w-5 h-5 bg-green-500 rounded-full animate-pulse"></div>
            </div>
            <h1 className="text-5xl font-black text-gradient mb-3">Chào Mừng Trở Lại</h1>
            <p className="text-gray-400 text-lg">Đăng nhập để tiếp tục hành trình</p>
          </div>

          {/* Quick Login Options */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            <button className="glass p-3 rounded-xl hover:bg-white/10 transition-all flex items-center justify-center gap-2">
              <span className="text-xl">🔵</span>
              <span className="text-sm font-semibold">Google</span>
            </button>
            <button className="glass p-3 rounded-xl hover:bg-white/10 transition-all flex items-center justify-center gap-2">
              <span className="text-xl">⚫</span>
              <span className="text-sm font-semibold">GitHub</span>
            </button>
          </div>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-white/20"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 glass-strong text-gray-400">hoặc tiếp tục với email</span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Email Input */}
            <div>
              <label className="block text-base font-semibold mb-3 text-gray-300 flex items-center gap-2">
                <span className="text-xl">📧</span> Địa Chỉ Email
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({...formData, email: e.target.value})}
                className="w-full px-5 py-4 text-base rounded-xl glass border border-white/20 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/50 transition-all outline-none text-white placeholder-gray-500"
                placeholder="yourname@voicehub.com"
              />
            </div>

            {/* Password Input */}
            <div>
              <label className="block text-base font-semibold mb-3 text-gray-300 flex items-center gap-2">
                <span className="text-xl">🔒</span> Mật Khẩu
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={formData.password}
                  onChange={(e) => setFormData({...formData, password: e.target.value})}
                  className="w-full px-5 py-4 text-base rounded-xl glass border border-white/20 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/50 transition-all outline-none text-white placeholder-gray-500"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xl hover:scale-110 transition-transform"
                >
                  {showPassword ? '👁️' : '👁️‍🗨️'}
                </button>
              </div>
            </div>

            {/* Remember Me & Forgot Password */}
            <div className="flex items-center justify-between text-sm">
              <label className="flex items-center text-gray-400 cursor-pointer group">
                <input 
                  type="checkbox" 
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="mr-2 rounded w-4 h-4 border-white/20" 
                />
                <span className="group-hover:text-white transition-colors">Ghi nhớ đăng nhập</span>
              </label>
              <a href="#" className="text-purple-400 hover:text-pink-400 transition-colors font-semibold">
                Quên mật khẩu?
              </a>
            </div>

            {/* Login Button */}
            <GradientButton variant="primary" className="w-full" icon="🚀">
              Đăng Nhập
            </GradientButton>

            {/* Security Badge */}
            <div className="flex items-center justify-center gap-2 text-xs text-gray-500">
              <span>🔒</span>
              <span>Bảo mật bởi JWT + 2FA</span>
            </div>
          </form>

          {/* Register Link */}
          <div className="mt-6 text-center text-gray-400">
            Chưa có tài khoản?{' '}
            <Link to="/register" className="text-purple-400 hover:text-pink-400 font-semibold transition-colors">
              Tạo ngay
            </Link>
          </div>

          {/* Back Link */}
          <Link to="/" className="block mt-6 text-center text-gray-500 hover:text-gray-300 transition-colors flex items-center justify-center gap-2">
            <span>←</span> Về Trang Chủ
          </Link>
        </GlassCard>
        </div>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;
