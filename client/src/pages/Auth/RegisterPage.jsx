import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { GlassCard, GradientButton } from '../../components/Shared';
import { useAuth } from '../../context/AuthContext';

function RegisterPage() {
  const navigate = useNavigate();
  const { register } = useAuth();
  const [formData, setFormData] = useState({ firstName: '', lastName: '', email: '', password: '', confirmPassword: '' });
  const [passwordStrength, setPasswordStrength] = useState(0);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [loading, setLoading] = useState(false);

  const calculatePasswordStrength = (password) => {
    let strength = 0;
    if (password.length >= 8) strength++;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength++;
    if (/\d/.test(password)) strength++;
    if (/[^a-zA-Z0-9]/.test(password)) strength++;
    return strength;
  };

  const handlePasswordChange = (e) => {
    const newPassword = e.target.value;
    setFormData({...formData, password: newPassword});
    setPasswordStrength(calculatePasswordStrength(newPassword));
  };

  const getStrengthColor = () => {
    if (passwordStrength === 0) return "from-gray-500 to-gray-600";
    if (passwordStrength === 1) return "from-red-500 to-orange-500";
    if (passwordStrength === 2) return "from-yellow-500 to-orange-500";
    if (passwordStrength === 3) return "from-green-500 to-emerald-500";
    return "from-green-600 to-teal-600";
  };

  const getStrengthText = () => {
    if (passwordStrength === 0) return "Rất yếu";
    if (passwordStrength === 1) return "Yếu";
    if (passwordStrength === 2) return "Trung bình";
    if (passwordStrength === 3) return "Mạnh";
    return "Rất mạnh";
  };

  const [errors, setErrors] = useState({});

  const validateForm = () => {
    const newErrors = {};

    // Validate firstName
    if (!formData.firstName || formData.firstName.trim().length < 1) {
      newErrors.firstName = 'Vui lòng nhập họ';
    } else if (formData.firstName.trim().length < 2) {
      newErrors.firstName = 'Họ phải có ít nhất 2 ký tự';
    }

    // Validate lastName
    if (!formData.lastName || formData.lastName.trim().length < 1) {
      newErrors.lastName = 'Vui lòng nhập tên';
    } else if (formData.lastName.trim().length < 2) {
      newErrors.lastName = 'Tên phải có ít nhất 2 ký tự';
    }

    if (!formData.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Email không hợp lệ';
    }

    if (!formData.password || formData.password.length < 8) {
      newErrors.password = 'Mật khẩu phải có ít nhất 8 ký tự';
    } else if (passwordStrength < 3) {
      newErrors.password = 'Mật khẩu phải có chữ hoa, chữ thường, số và ký tự đặc biệt (!@#$%^&*...)';
    }

    if (!formData.confirmPassword) {
      newErrors.confirmPassword = 'Vui lòng xác nhận mật khẩu';
    } else if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Mật khẩu xác nhận không khớp';
    }

    if (!agreedToTerms) {
      newErrors.terms = 'Vui lòng đồng ý với điều khoản dịch vụ';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleRegister = async (e) => {
    e.preventDefault();

    // Validate form
    if (!validateForm()) {
      console.log('[RegisterPage] Form validation failed');
      return;
    }

    console.log('[RegisterPage] Starting registration process...');
    setLoading(true);
    
    try {
      // Gửi đúng format backend yêu cầu: firstName, lastName, email, password
      const firstName = formData.firstName.trim();
      const lastName = formData.lastName.trim();

      console.log('[RegisterPage] Calling register API with:', {
        email: formData.email,
        firstName,
        lastName,
        passwordLength: formData.password.length,
      });

      const startTime = Date.now();
      const success = await register({
        firstName,
        lastName,
        email: formData.email,
        password: formData.password,
      });
      const duration = Date.now() - startTime;

      console.log(`[RegisterPage] Register API call completed in ${duration}ms, success:`, success);

      if (success) {
        console.log('[RegisterPage] ✅ Registration successful, redirecting to login...');
        // Hiển thị thông báo đang gửi email xác thực
        // Sau đó redirect về login
        navigate('/login', { 
          state: { 
            message: 'Đăng ký thành công! Vui lòng kiểm tra email để xác thực tài khoản.' 
          } 
        });
      } else {
        console.warn('[RegisterPage] ⚠️ Registration returned false - check error messages above');
        // Error đã được hiển thị trong AuthContext
      }
    } catch (error) {
      console.error('[RegisterPage] ❌ Registration error:', error);
      console.error('[RegisterPage] Error details:', {
        message: error?.message,
        stack: error?.stack,
        name: error?.name,
        code: error?.code,
      });
      // Error đã được handle trong AuthContext, chỉ log thêm ở đây
    } finally {
      setLoading(false);
      console.log('[RegisterPage] Registration process completed');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-8 lg:p-12 relative overflow-hidden">
      {/* Animated Background */}
      <div className="absolute top-20 right-20 w-[500px] h-[500px] bg-blue-600/20 rounded-full blur-3xl animate-float"></div>
      <div className="absolute bottom-20 left-20 w-[500px] h-[500px] bg-cyan-600/20 rounded-full blur-3xl animate-float" style={{animationDelay: '1s'}}></div>
      <div className="absolute top-1/3 right-1/3 w-[400px] h-[400px] bg-purple-600/10 rounded-full blur-3xl animate-float" style={{animationDelay: '2s'}}></div>
      
      <div className="relative z-10 w-full max-w-7xl animate-scaleIn">
        <div className="grid lg:grid-cols-2 gap-12 items-center min-h-[650px]">
        {/* Left Side - Register Form */}
        <div>
        <GlassCard className="glass-strong p-10">
          {/* Logo and Title */}
          <div className="text-center mb-10">
            <div className="relative inline-block mb-6">
              <div className="text-7xl">✨</div>
              <div className="absolute -top-1 -right-1 w-5 h-5 bg-blue-500 rounded-full animate-pulse"></div>
            </div>
            <h1 className="text-5xl font-black text-gradient-cool mb-3">Tham Gia VoiceHub</h1>
            <p className="text-gray-400 text-lg">Tạo tài khoản trong vài giây</p>
          </div>

          {/* Benefits */}
          <div className="grid grid-cols-3 gap-3 mb-8">
            {[
              { icon: "⚡", label: "Nhanh chóng" },
              { icon: "🔒", label: "Bảo mật" },
              { icon: "🎁", label: "Miễn phí" }
            ].map((benefit, idx) => (
              <div key={idx} className="glass p-4 rounded-xl text-center hover:bg-white/10 transition-all">
                <div className="text-3xl mb-2">{benefit.icon}</div>
                <div className="text-sm font-semibold text-gray-300">{benefit.label}</div>
              </div>
            ))}
          </div>

          <form className="space-y-5" onSubmit={handleRegister}>
            {/* First Name and Last Name Inputs */}
            <div className="grid grid-cols-2 gap-4">
              {/* Last Name (Họ) */}
              <div>
                <label className="block text-sm font-semibold mb-2 text-gray-300 flex items-center gap-2">
                  <span>👤</span> Họ
                </label>
                <input
                  type="text"
                  value={formData.lastName}
                  onChange={(e) => {
                    setFormData({...formData, lastName: e.target.value});
                    if (errors.lastName) setErrors({...errors, lastName: ''});
                  }}
                  className={`w-full px-4 py-3 rounded-xl glass border transition-all outline-none text-white placeholder-gray-500 ${
                    errors.lastName ? 'border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-500/50' : 'border-white/20 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50'
                  }`}
                  placeholder="Nguyễn"
                />
                {errors.lastName && <p className="mt-1 text-xs text-red-400">{errors.lastName}</p>}
              </div>

              {/* First Name (Tên) */}
              <div>
                <label className="block text-sm font-semibold mb-2 text-gray-300 flex items-center gap-2">
                  <span>👤</span> Tên
                </label>
                <input
                  type="text"
                  value={formData.firstName}
                  onChange={(e) => {
                    setFormData({...formData, firstName: e.target.value});
                    if (errors.firstName) setErrors({...errors, firstName: ''});
                  }}
                  className={`w-full px-4 py-3 rounded-xl glass border transition-all outline-none text-white placeholder-gray-500 ${
                    errors.firstName ? 'border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-500/50' : 'border-white/20 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50'
                  }`}
                  placeholder="Văn Huy"
                />
                {errors.firstName && <p className="mt-1 text-xs text-red-400">{errors.firstName}</p>}
              </div>
            </div>

            {/* Email Input */}
            <div>
              <label className="block text-sm font-semibold mb-2 text-gray-300 flex items-center gap-2">
                <span>📧</span> Địa Chỉ Email
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => {
                  setFormData({...formData, email: e.target.value});
                  if (errors.email) setErrors({...errors, email: ''});
                }}
                className={`w-full px-4 py-3 rounded-xl glass border transition-all outline-none text-white placeholder-gray-500 ${
                  errors.email ? 'border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-500/50' : 'border-white/20 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50'
                }`}
                placeholder="yourname@email.com"
              />
              {errors.email && <p className="mt-1 text-xs text-red-400">{errors.email}</p>}
            </div>

            {/* Password Input with Strength Meter */}
            <div>
              <label className="block text-sm font-semibold mb-2 text-gray-300 flex items-center gap-2">
                <span>🔒</span> Mật Khẩu
              </label>
              <input
                type="password"
                value={formData.password}
                onChange={handlePasswordChange}
                className="w-full px-4 py-3 rounded-xl glass border border-white/20 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50 transition-all outline-none text-white placeholder-gray-500"
                placeholder="••••••••"
              />
              {formData.password && (
                <div className="mt-2">
                  <div className="flex gap-1 mb-1">
                    {[...Array(4)].map((_, idx) => (
                      <div 
                        key={idx} 
                        className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                          idx < passwordStrength 
                            ? `bg-gradient-to-r ${getStrengthColor()}` 
                            : 'bg-white/10'
                        }`}
                      ></div>
                    ))}
                  </div>
                  <p className={`text-xs font-semibold bg-gradient-to-r ${getStrengthColor()} bg-clip-text text-transparent`}>
                    {getStrengthText()}
                  </p>
                </div>
              )}
              {errors.password && <p className="mt-1 text-xs text-red-400">{errors.password}</p>}
            </div>

            {/* Confirm Password */}
            <div>
              <label className="block text-sm font-semibold mb-2 text-gray-300 flex items-center gap-2">
                <span>🔐</span> Xác Nhận Mật Khẩu
              </label>
              <input
                type="password"
                value={formData.confirmPassword}
                onChange={(e) => {
                  setFormData({...formData, confirmPassword: e.target.value});
                  if (errors.confirmPassword) setErrors({...errors, confirmPassword: ''});
                }}
                className={`w-full px-4 py-3 rounded-xl glass border transition-all outline-none text-white placeholder-gray-500 ${
                  errors.confirmPassword ? 'border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-500/50' : 'border-white/20 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50'
                }`}
                placeholder="••••••••"
              />
              {errors.confirmPassword && <p className="mt-1 text-xs text-red-400">{errors.confirmPassword}</p>}
            </div>

            {/* Terms Checkbox */}
            <div>
              <label className="flex items-start gap-3 cursor-pointer group">
                <input 
                  type="checkbox" 
                  checked={agreedToTerms}
                  onChange={(e) => {
                    setAgreedToTerms(e.target.checked);
                    if (errors.terms) setErrors({...errors, terms: ''});
                  }}
                  className="mt-1 rounded w-4 h-4 border-white/20" 
                />
                <span className="text-sm text-gray-400 group-hover:text-gray-300 transition-colors">
                  Tôi đồng ý với{' '}
                  <a href="#" className="text-blue-400 hover:text-cyan-400">Điều khoản dịch vụ</a>
                  {' '}và{' '}
                  <a href="#" className="text-blue-400 hover:text-cyan-400">Chính sách bảo mật</a>
                </span>
              </label>
              {errors.terms && <p className="mt-1 text-xs text-red-400">{errors.terms}</p>}
            </div>

            {/* Register Button */}
            <GradientButton 
              variant="secondary" 
              className="w-full" 
              icon="🎉"
              type="submit"
              disabled={loading || !agreedToTerms || !formData.firstName || !formData.lastName || !formData.email || !formData.password || !formData.confirmPassword}
            >
              {loading ? 'Đang gửi email xác thực...' : 'Tạo Tài Khoản'}
            </GradientButton>

            {/* Security Info */}
            <div className="flex items-center justify-center gap-2 text-xs text-gray-500">
              <span>🛡️</span>
              <span>Mã hóa end-to-end • GDPR compliant</span>
            </div>
          </form>

          {/* Login Link */}
          <div className="mt-6 text-center text-gray-400">
            Đã có tài khoản?{' '}
            <Link to="/login" className="text-blue-400 hover:text-cyan-400 font-semibold transition-colors">
              Đăng nhập ngay
            </Link>
          </div>

          {/* Back Link */}
          <Link to="/" className="block mt-6 text-center text-gray-500 hover:text-gray-300 transition-colors flex items-center justify-center gap-2">
            <span>←</span> Về Trang Chủ
          </Link>
        </GlassCard>
        </div>
        
        {/* Right Side - Benefits */}
        <div className="hidden lg:block">
          <GlassCard className="glass-strong p-10">
            <div className="text-7xl mb-8 animate-float">✨</div>
            <h2 className="text-5xl font-black text-gradient-cool mb-6 leading-tight">Tại sao chọn VoiceHub?</h2>
            <p className="text-gray-300 mb-8 text-xl leading-relaxed">Giải pháp toàn diện cho doanh nghiệp và nhân viên</p>
            <div className="space-y-8">
              {[
                { icon: "🚀", title: "Miễn phí mãi mãi", desc: "Không giới hạn người dùng, không phí ẩn", color: "from-purple-600 to-pink-600" },
                { icon: "⚡", title: "Siêu nhanh", desc: "Tin nhắn gửi tức thời < 50ms", color: "from-blue-500 to-cyan-500" },
                { icon: "🔒", title: "An toàn tuyệt đối", desc: "Mã hóa E2E, tuân thủ GDPR", color: "from-green-500 to-emerald-500" },
                { icon: "🌍", title: "Đa nền tảng", desc: "Web, Desktop, Mobile seamless", color: "from-orange-500 to-red-500" }
              ].map((item, idx) => (
                <div key={idx} className="flex items-start gap-5 p-4 glass rounded-xl hover:bg-white/5 transition-all">
                  <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${item.color} flex items-center justify-center text-3xl shadow-lg`}>
                    {item.icon}
                  </div>
                  <div>
                    <h3 className="text-white font-bold text-xl mb-1">{item.title}</h3>
                    <p className="text-gray-400 text-base">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>
        </div>
        </div>
      </div>
    </div>
  );
}

export default RegisterPage;
