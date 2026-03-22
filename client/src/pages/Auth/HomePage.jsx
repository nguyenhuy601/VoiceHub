import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { GlassCard, GradientButton } from '../../components/Shared';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';

function HomePage() {
  const [hoveredFeature, setHoveredFeature] = useState(null);
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  
  // Xử lý click vào feature - kiểm tra quyền Guest
  const handleFeatureClick = (e, feature) => {
    // Các feature Guest KHÔNG được truy cập
    const restrictedFeatures = ['/chat', '/voice', '/organizations'];
    const isRestricted = restrictedFeatures.some(path => feature.link.startsWith(path));
    
    if (!isAuthenticated && isRestricted) {
      e.preventDefault();
      toast.error('Vui lòng đăng nhập để sử dụng tính năng này');
      navigate('/login');
    }
  };
  
  const features = [
    {
      icon: "🔐",
      title: "Xác Thực Thông Minh",
      desc: "Bảo mật nâng cao với hỗ trợ sinh trắc học",
      color: "from-cyan-500 to-blue-600",
      link: "/login",
      stats: "99.9% bảo mật"
    },
    {
      icon: "🎯",
      title: "Trung Tâm Điều Khiển",
      desc: "Phân tích và thống kê thời gian thực",
      color: "from-blue-500 to-cyan-500",
      link: "/dashboard",
      stats: "Phân tích trực tiếp"
    },
    {
      icon: "💬",
      title: "Nhắn Tin Tức Thời",
      desc: "Trò chuyện có luồng cực nhanh",
      color: "from-green-500 to-emerald-500",
      link: "/chat",
      stats: "<50ms độ trễ",
      requiresAuth: true // Guest không được truy cập
    },
    {
      icon: "🎤",
      title: "Không Gian Ảo",
      desc: "Phòng voice và video nhập vai",
      color: "from-orange-500 to-red-500",
      link: "/voice/room1",
      stats: "Hỗ trợ 4K",
      requiresAuth: true // Guest không được truy cập
    },
    {
      icon: "🏢",
      title: "Trung Tâm Đội Nhóm",
      desc: "Không gian làm việc cộng tác",
      color: "from-pink-500 to-rose-500",
      link: "/organizations",
      stats: "Không giới hạn",
      requiresAuth: true // Guest không được truy cập
    },
    {
      icon: "👥",
      title: "Mạng Xã Hội",
      desc: "Kết nối chuyên nghiệp toàn cầu",
      color: "from-yellow-500 to-orange-500",
      link: "/friends",
      stats: "500K+ người dùng"
    }
  ];

  const quickStats = [
    { icon: "👥", value: "500K+", label: "Người Dùng", trend: "+12%", color: "from-cyan-500 to-blue-600" },
    { icon: "💬", value: "1M+", label: "Tin Nhắn/Ngày", trend: "+25%", color: "from-blue-500 to-cyan-500" },
    { icon: "🚀", value: "99.9%", label: "Thời Gian Hoạt Động", trend: "Ổn định", color: "from-green-500 to-emerald-500" },
    { icon: "🌍", value: "150+", label: "Quốc Gia", trend: "+8", color: "from-orange-500 to-red-500" }
  ];

  const techStack = [
    { name: "React", icon: "⚛️", color: "from-cyan-500 to-blue-500" },
    { name: "Node.js", icon: "🟢", color: "from-green-500 to-emerald-500" },
    { name: "WebRTC", icon: "📹", color: "from-cyan-500 to-blue-600" },
    { name: "MongoDB", icon: "🍃", color: "from-green-600 to-teal-600" },
    { name: "Redis", icon: "⚡", color: "from-red-500 to-orange-500" },
    { name: "Docker", icon: "🐳", color: "from-blue-600 to-cyan-600" }
  ];

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#020817] text-slate-100">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-20 -left-20 h-[22rem] w-[22rem] rounded-full border border-cyan-500/20 bg-cyan-500/10 blur-2xl animate-pulse-slow" />
        <div className="absolute top-12 left-1/2 h-56 w-[20rem] rounded-[48%] border border-sky-500/20 bg-sky-500/10 blur-2xl animate-pulse-slow" style={{ animationDelay: '0.35s' }} />
        <div className="absolute -bottom-16 right-8 h-[18rem] w-[18rem] rounded-full border border-blue-500/20 bg-blue-500/10 blur-2xl animate-pulse-slow" style={{ animationDelay: '0.8s' }} />
      </div>

      <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-[#020817]/80 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-3.5">
          <Link to="/" className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 text-sm text-white shadow-[0_0_20px_rgba(14,165,233,0.35)]">V</div>
            <div>
              <p className="text-base font-bold">VoiceHub</p>
              <p className="text-xs text-slate-400">Nền tảng giao tiếp doanh nghiệp</p>
            </div>
          </Link>

          <div className="flex items-center gap-3">
            {isAuthenticated ? (
              <>
                <button
                  type="button"
                  onClick={() => navigate('/dashboard')}
                  className="rounded-lg border border-slate-700 bg-slate-900/60 px-3.5 py-1.5 text-xs font-semibold text-slate-100 transition hover:bg-slate-800"
                >
                  Bảng điều khiển
                </button>
                <button
                  type="button"
                  onClick={() => {
                    toast('Bạn đã đăng nhập rồi.');
                    navigate('/dashboard');
                  }}
                  className="rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 px-3.5 py-1.5 text-xs font-bold text-white transition hover:from-cyan-400 hover:to-blue-500"
                >
                  Tiếp tục
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="rounded-lg border border-slate-700 bg-slate-900/60 px-3.5 py-1.5 text-xs font-semibold text-slate-100 transition hover:bg-slate-800">Đăng nhập</Link>
                <Link to="/register" className="rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 px-3.5 py-1.5 text-xs font-bold text-white transition hover:from-cyan-400 hover:to-blue-500">Đăng ký</Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-7xl px-5 py-10">
        <section className="grid gap-8 lg:grid-cols-[1.2fr_1fr] lg:items-center">
          <div className="animate-slideUp" style={{ animationDelay: '0.05s' }}>
            <p className="inline-flex rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs text-cyan-200">
              Nền tảng cộng tác thời gian thực
            </p>
            <h1 className="mt-5 text-4xl font-extrabold leading-tight text-white sm:text-5xl">
              Giao tiếp công việc,
              <span className="block bg-gradient-to-r from-cyan-300 to-blue-300 bg-clip-text text-transparent">thiết kế để tăng tốc</span>
            </h1>
            <p className="mt-4 max-w-2xl text-base text-slate-300">
              Kết nối nhân viên, đội nhóm và tổ chức trên một nền tảng thống nhất cho chat, gọi thoại và quản trị công việc.
            </p>

            <div className="mt-6 flex flex-wrap gap-2.5">
              <GradientButton
                variant="primary"
                className="rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-5 py-2.5 text-sm font-bold hover:from-cyan-400 hover:to-blue-500"
                onClick={() => navigate(isAuthenticated ? '/dashboard' : '/register')}
              >
                {isAuthenticated ? 'Vào bảng điều khiển' : 'Bắt đầu miễn phí'}
              </GradientButton>
              <GradientButton
                variant="secondary"
                className="rounded-xl border border-slate-700 bg-slate-900/60 px-5 py-2.5 text-sm font-semibold text-slate-100 hover:bg-slate-800"
                onClick={() => {
                  if (!isAuthenticated) {
                    toast('Vui lòng đăng nhập để xem demo đầy đủ.');
                    navigate('/login');
                    return;
                  }
                  navigate('/dashboard');
                }}
              >
                Trải nghiệm ngay
              </GradientButton>
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              {techStack.map((tech, idx) => (
                <span key={idx} className="rounded-full border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-xs text-slate-300">
                  {tech.name}
                </span>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-cyan-500/20 bg-gradient-to-b from-[#06132d]/90 to-[#020a1e]/95 p-5 shadow-[0_12px_32px_rgba(2,8,23,0.55)] backdrop-blur-xl animate-slideUp" style={{ animationDelay: '0.15s' }}>
            <p className="mb-3 text-xs text-slate-400">Toàn cảnh hệ thống</p>
            <div className="space-y-3">
              {quickStats.map((stat, idx) => (
                <div key={idx} className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2.5 animate-slideUp" style={{ animationDelay: `${0.22 + idx * 0.06}s` }}>
                  <span className="text-xs text-slate-300">{stat.label}</span>
                  <div className="text-right">
                    <p className="text-lg font-bold text-white">{stat.value}</p>
                    <p className="text-xs text-emerald-400">{stat.trend}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {features.map((feature, idx) => {
            const isRestricted = feature.requiresAuth && !isAuthenticated;

            const card = (
              <GlassCard
                hover={!isRestricted}
                className={`group h-full border border-slate-800 bg-slate-900/60 p-4 transition animate-slideUp ${isRestricted ? 'opacity-70' : ''}`}
                style={{ animationDelay: `${0.35 + idx * 0.08}s` }}
              >
                <div className={`mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br ${feature.color} text-lg`}>
                  {feature.icon}
                </div>
                <h3 className="text-lg font-bold text-white">{feature.title}</h3>
                <p className="mt-1.5 text-xs text-slate-400">{feature.desc}</p>
                <div className="mt-3 flex items-center justify-between">
                  <span className="rounded-full border border-slate-700 bg-slate-800/70 px-3 py-1 text-xs text-slate-300">{feature.stats}</span>
                  <span className={`text-xs font-semibold ${isRestricted ? 'text-slate-500' : 'text-cyan-300'}`}>
                    {isRestricted ? 'Cần đăng nhập' : 'Khám phá'}
                  </span>
                </div>
              </GlassCard>
            );

            if (isRestricted) {
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={(e) => handleFeatureClick(e, feature)}
                  onMouseEnter={() => setHoveredFeature(idx)}
                  onMouseLeave={() => setHoveredFeature(null)}
                  className="relative text-left"
                >
                  {card}
                  {hoveredFeature === idx && (
                    <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/50 text-sm font-semibold text-white backdrop-blur-sm">
                      Vui lòng đăng nhập
                    </div>
                  )}
                </button>
              );
            }

            return (
              <Link
                key={idx}
                to={feature.link}
                onMouseEnter={() => setHoveredFeature(idx)}
                onMouseLeave={() => setHoveredFeature(null)}
              >
                {card}
              </Link>
            );
          })}
        </section>
      </main>
    </div>
  );
}

export default HomePage;
