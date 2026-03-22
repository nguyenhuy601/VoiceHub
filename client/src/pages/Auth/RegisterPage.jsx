import { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { GradientButton } from '../../components/Shared';
import { useAuth } from '../../context/AuthContext';

function RegisterPage() {
  const navigate = useNavigate();
  const { register } = useAuth();
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
    dateOfBirth: '',
  });

  /** Trùng logic backend: từ 13 đến 120 tuổi — dùng ngày local để tránh lệch timezone so với input type="date" */
  const birthDateBounds = useMemo(() => {
    const today = new Date();
    const max = new Date(today.getFullYear() - 13, today.getMonth(), today.getDate());
    const min = new Date(today.getFullYear() - 120, today.getMonth(), today.getDate());
    const pad = (n) => String(n).padStart(2, '0');
    const toYmd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    return { min: toYmd(min), max: toYmd(max) };
  }, []);
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

    if (!formData.dateOfBirth || !String(formData.dateOfBirth).trim()) {
      newErrors.dateOfBirth = 'Vui lòng chọn ngày sinh';
    } else {
      const raw = String(formData.dateOfBirth).trim();
      if (raw < birthDateBounds.min || raw > birthDateBounds.max) {
        newErrors.dateOfBirth = 'Ngày sinh phải phù hợp độ tuổi đăng ký (từ 13 đến 120 tuổi)';
      }
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
        dateOfBirth: formData.dateOfBirth,
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
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-500/10 px-3 py-1 text-xs font-semibold text-cyan-200">
              <span className="h-2 w-2 rounded-full bg-cyan-300" />
              Khởi tạo không gian làm việc trong vài phút
            </div>
          </div>

          <div className="max-w-md animate-slideUp" style={{ animationDelay: '0.15s' }}>
            <h1 className="text-5xl font-extrabold tracking-tight font-['Space_Grotesk']">Tạo tài khoản</h1>
            <p className="mt-4 text-2xl leading-tight text-slate-300">
              Xây dựng không gian làm việc trong vài phút với các công cụ giao tiếp an toàn, ổn định.
            </p>
            <p className="mt-3 text-sm text-slate-400">
              Kết nối đội ngũ, chuẩn hóa quy trình trao đổi và tăng tốc ra quyết định trong cùng một nền tảng.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm text-slate-300 animate-slideUp" style={{ animationDelay: '0.25s' }}>
            <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-3">Chat thời gian thực</div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-3">Họp video</div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-3">Không gian nhóm</div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-3">Bảo mật RBAC</div>
          </div>
        </section>

        <section className="flex items-center justify-center px-5 py-10 sm:px-8 lg:px-12">
          <div className="w-full max-w-lg rounded-2xl border border-cyan-500/20 bg-gradient-to-b from-[#07122f]/90 to-[#030b1f]/95 p-6 shadow-[0_14px_40px_rgba(2,8,23,0.62)] backdrop-blur-xl animate-slideUp sm:p-8">
            <div className="mb-2 text-right text-sm text-slate-400">
              Đã có tài khoản?{' '}
              <Link to="/login" className="font-semibold text-cyan-400 hover:text-cyan-300 transition-colors">Đăng nhập</Link>
            </div>

            <h2 className="mt-4 text-3xl font-bold text-white">Tạo tài khoản của bạn</h2>
            <p className="mt-2 text-base text-slate-400">Bắt đầu không gian làm việc nhóm với bảo mật cấp doanh nghiệp.</p>

            <form className="mt-6 space-y-4" onSubmit={handleRegister}>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-200">Họ</label>
                  <input
                    type="text"
                    value={formData.lastName}
                    onChange={(e) => {
                      setFormData({ ...formData, lastName: e.target.value });
                      if (errors.lastName) setErrors({ ...errors, lastName: '' });
                    }}
                    className={`w-full rounded-xl border px-4 py-2.5 text-sm text-white placeholder:text-slate-500 transition ${
                      errors.lastName ? 'border-red-500 bg-red-500/5 focus:border-red-500 focus:ring-2 focus:ring-red-500/30' : 'border-slate-800 bg-[#040f2a] focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/40'
                    }`}
                    placeholder="Nguyễn"
                  />
                  {errors.lastName && <p className="mt-1 text-xs text-red-400">{errors.lastName}</p>}
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-200">Tên</label>
                  <input
                    type="text"
                    value={formData.firstName}
                    onChange={(e) => {
                      setFormData({ ...formData, firstName: e.target.value });
                      if (errors.firstName) setErrors({ ...errors, firstName: '' });
                    }}
                    className={`w-full rounded-xl border px-4 py-2.5 text-sm text-white placeholder:text-slate-500 transition ${
                      errors.firstName ? 'border-red-500 bg-red-500/5 focus:border-red-500 focus:ring-2 focus:ring-red-500/30' : 'border-slate-800 bg-[#040f2a] focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/40'
                    }`}
                    placeholder="Văn Huy"
                  />
                  {errors.firstName && <p className="mt-1 text-xs text-red-400">{errors.firstName}</p>}
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-200">Ngày sinh</label>
                <input
                  type="date"
                  value={formData.dateOfBirth}
                  min={birthDateBounds.min}
                  max={birthDateBounds.max}
                  onChange={(e) => {
                    setFormData({ ...formData, dateOfBirth: e.target.value });
                    if (errors.dateOfBirth) setErrors({ ...errors, dateOfBirth: '' });
                  }}
                  className={`w-full rounded-xl border px-4 py-2.5 text-sm text-white transition [color-scheme:dark] ${
                    errors.dateOfBirth
                      ? 'border-red-500 bg-red-500/5 focus:border-red-500 focus:ring-2 focus:ring-red-500/30'
                      : 'border-slate-800 bg-[#040f2a] focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/40'
                  }`}
                />
                <p className="mt-1 text-xs text-slate-500">Bắt buộc — từ 13 đến 120 tuổi (theo quy định đăng ký).</p>
                {errors.dateOfBirth && <p className="mt-1 text-xs text-red-400">{errors.dateOfBirth}</p>}
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-200">Email</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => {
                    setFormData({ ...formData, email: e.target.value });
                    if (errors.email) setErrors({ ...errors, email: '' });
                  }}
                  className={`w-full rounded-xl border px-4 py-2.5 text-sm text-white placeholder:text-slate-500 transition ${
                    errors.email ? 'border-red-500 bg-red-500/5 focus:border-red-500 focus:ring-2 focus:ring-red-500/30' : 'border-slate-800 bg-[#040f2a] focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/40'
                  }`}
                  placeholder="tenban@congty.com"
                />
                {errors.email && <p className="mt-1 text-xs text-red-400">{errors.email}</p>}
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-200">Mật khẩu</label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={handlePasswordChange}
                  className="w-full rounded-xl border border-slate-800 bg-[#040f2a] px-4 py-2.5 text-sm text-white placeholder:text-slate-500 transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/40"
                  placeholder="••••••••"
                />
                {formData.password && (
                  <div className="mt-2">
                    <div className="mb-1 flex gap-1">
                      {[...Array(4)].map((_, idx) => (
                        <div
                          key={idx}
                          className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                            idx < passwordStrength ? `bg-gradient-to-r ${getStrengthColor()}` : 'bg-slate-800'
                          }`}
                        />
                      ))}
                    </div>
                    <p className={`text-xs font-semibold bg-gradient-to-r ${getStrengthColor()} bg-clip-text text-transparent`}>
                      {getStrengthText()}
                    </p>
                  </div>
                )}
                {errors.password && <p className="mt-1 text-xs text-red-400">{errors.password}</p>}
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-200">Xác nhận mật khẩu</label>
                <input
                  type="password"
                  value={formData.confirmPassword}
                  onChange={(e) => {
                    setFormData({ ...formData, confirmPassword: e.target.value });
                    if (errors.confirmPassword) setErrors({ ...errors, confirmPassword: '' });
                  }}
                  className={`w-full rounded-xl border px-4 py-2.5 text-sm text-white placeholder:text-slate-500 transition ${
                    errors.confirmPassword ? 'border-red-500 bg-red-500/5 focus:border-red-500 focus:ring-2 focus:ring-red-500/30' : 'border-slate-800 bg-[#040f2a] focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/40'
                  }`}
                  placeholder="••••••••"
                />
                {errors.confirmPassword && <p className="mt-1 text-xs text-red-400">{errors.confirmPassword}</p>}
              </div>

              <div>
                <label className="flex items-start gap-3 text-sm text-slate-400">
                  <input
                    type="checkbox"
                    checked={agreedToTerms}
                    onChange={(e) => {
                      setAgreedToTerms(e.target.checked);
                      if (errors.terms) setErrors({ ...errors, terms: '' });
                    }}
                    className="mt-1 h-4 w-4 rounded border-slate-700 bg-slate-900 text-cyan-500"
                  />
                  <span>
                    Tôi đồng ý với{' '}
                    <Link to="/terms-of-service" className="text-cyan-400 hover:text-cyan-300">Điều khoản dịch vụ</Link>
                    {' '}và{' '}
                    <Link to="/privacy-policy" className="text-cyan-400 hover:text-cyan-300">Chính sách bảo mật</Link>
                  </span>
                </label>
                {errors.terms && <p className="mt-1 text-xs text-red-400">{errors.terms}</p>}
              </div>

              <GradientButton
                variant="primary"
                className="w-full justify-center rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 py-3 text-base font-bold hover:from-cyan-400 hover:to-blue-500"
                type="submit"
                disabled={
                  loading ||
                  !agreedToTerms ||
                  !formData.firstName ||
                  !formData.lastName ||
                  !formData.dateOfBirth ||
                  !formData.email ||
                  !formData.password ||
                  !formData.confirmPassword
                }
              >
                {loading ? 'Đang gửi email xác thực...' : 'Tạo tài khoản'}
              </GradientButton>

              <p className="text-center text-xs text-slate-500">
                Bằng việc tạo tài khoản, bạn đang bật môi trường cộng tác được kiểm soát quyền truy cập theo vai trò.
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

export default RegisterPage;
