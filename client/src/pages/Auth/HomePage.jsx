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
      color: "from-purple-600 to-pink-600",
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
      icon: "✅",
      title: "Quản Lý Công Việc",
      desc: "Theo dõi và quản lý task hiệu quả",
      color: "from-indigo-500 to-purple-500",
      link: "/tasks",
      stats: "Kanban Board"
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
    },
    {
      icon: "📁",
      title: "Lưu Trữ Đám Mây",
      desc: "Chia sẻ file bảo mật và cộng tác",
      color: "from-teal-500 to-green-500",
      link: "/documents",
      stats: "Lưu trữ 1TB"
    }
  ];

  const quickStats = [
    { icon: "👥", value: "500K+", label: "Người Dùng", trend: "+12%", color: "from-purple-600 to-pink-600" },
    { icon: "💬", value: "1M+", label: "Tin Nhắn/Ngày", trend: "+25%", color: "from-blue-500 to-cyan-500" },
    { icon: "🚀", value: "99.9%", label: "Thời Gian Hoạt Động", trend: "Stable", color: "from-green-500 to-emerald-500" },
    { icon: "🌍", value: "150+", label: "Quốc Gia", trend: "+8", color: "from-orange-500 to-red-500" }
  ];

  const techStack = [
    { name: "React", icon: "⚛️", color: "from-cyan-500 to-blue-500" },
    { name: "Node.js", icon: "🟢", color: "from-green-500 to-emerald-500" },
    { name: "WebRTC", icon: "📹", color: "from-purple-600 to-pink-600" },
    { name: "MongoDB", icon: "🍃", color: "from-green-600 to-teal-600" },
    { name: "Redis", icon: "⚡", color: "from-red-500 to-orange-500" },
    { name: "Docker", icon: "🐳", color: "from-blue-600 to-cyan-600" }
  ];

  return (
    <div className="min-h-screen overflow-hidden">
      {/* Animated background particles */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-20 w-72 h-72 bg-purple-600/20 rounded-full blur-3xl animate-float"></div>
        <div className="absolute bottom-20 right-20 w-96 h-96 bg-pink-600/20 rounded-full blur-3xl animate-float" style={{animationDelay: '1s'}}></div>
        <div className="absolute top-1/2 left-1/2 w-80 h-80 bg-blue-600/20 rounded-full blur-3xl animate-float" style={{animationDelay: '2s'}}></div>
      </div>

      {/* Top Header */}
      <div className="relative z-20">
        <header className="sticky top-0 backdrop-blur-xl bg-[#0a0118]/40 border-b border-white/10">
          <div className="container mx-auto px-6 py-4 flex items-center justify-between">
            <Link to="/" className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center text-xl animate-glow">
                🚀
              </div>
              <div className="leading-tight">
                <div className="text-lg font-black text-gradient">VoiceHub</div>
                <div className="text-xs text-gray-400">Enterprise Communication</div>
              </div>
            </Link>

            <div className="flex items-center gap-3">
              {isAuthenticated ? (
                <>
                  <button
                    type="button"
                    onClick={() => navigate('/dashboard')}
                    className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white text-sm font-semibold transition-colors"
                  >
                    Vào Dashboard
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      toast('Bạn đã đăng nhập rồi.');
                      navigate('/dashboard');
                    }}
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 text-white text-sm font-bold hover:opacity-90 transition-opacity"
                  >
                    Tiếp tục
                  </button>
                </>
              ) : (
                <>
                  <Link
                    to="/login"
                    className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white text-sm font-semibold transition-colors"
                  >
                    Đăng nhập
                  </Link>
                  <Link
                    to="/register"
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 text-white text-sm font-bold hover:opacity-90 transition-opacity"
                  >
                    Đăng ký
                  </Link>
                </>
              )}
            </div>
          </div>
        </header>
      </div>

      <div className="relative z-10 container mx-auto px-6 py-12">
        {/* Hero Section with Enhanced Details */}
        <div className="text-center mb-16 animate-slideUp">
          <div className="inline-block mb-4 relative">
            <span className="text-8xl animate-float">🚀</span>
            <div className="absolute -top-2 -right-2 w-6 h-6 bg-green-500 rounded-full animate-pulse border-4 border-[#0a0118]"></div>
          </div>
          <h1 className="text-7xl font-black mb-4">
            <span className="text-gradient">VoiceHub</span>
          </h1>
          <p className="text-2xl text-gray-300 font-light mb-2">
            Hệ Thống Giao Tiếp Doanh Nghiệp Thế Hệ Mới
          </p>
          <p className="text-sm text-gray-500 mb-2">
            Kết nối toàn bộ tổ chức, doanh nghiệp và nhân viên
          </p>
          <p className="text-xs text-gray-600 mb-8">
            Powered by Microservices • WebRTC • AWS Cloud
          </p>
          
          {/* Tech Stack Pills */}
          <div className="flex flex-wrap gap-2 justify-center mb-8">
            {techStack.map((tech, idx) => (
              <div 
                key={idx}
                className={`px-4 py-2 rounded-full bg-gradient-to-r ${tech.color} text-white text-sm font-semibold flex items-center gap-2 animate-scaleIn`}
                style={{animationDelay: `${idx * 0.1}s`}}
              >
                <span>{tech.icon}</span>
                {tech.name}
              </div>
            ))}
          </div>

          <div className="flex gap-4 justify-center">
            <GradientButton
              variant="primary"
              icon="🚀"
              onClick={() => navigate(isAuthenticated ? '/dashboard' : '/register')}
            >
              {isAuthenticated ? 'Vào Dashboard' : 'Bắt Đầu Miễn Phí'}
            </GradientButton>
            <GradientButton
              variant="secondary"
              icon="▶️"
              onClick={() => {
                if (!isAuthenticated) {
                  toast('Vui lòng đăng nhập để xem demo đầy đủ.');
                  navigate('/login');
                  return;
                }
                navigate('/dashboard');
              }}
            >
              Xem Demo
            </GradientButton>
          </div>

          {/* Live Stats Ticker */}
          <div className="mt-8 glass rounded-2xl p-4 max-w-2xl mx-auto">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-gray-400">Trạng thái hệ thống:</span>
                <span className="text-green-400 font-bold">Hoạt động tốt</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-gray-400">Người dùng online:</span>
                <span className="text-gradient-cool font-bold">12,458</span>
              </div>
            </div>
          </div>
        </div>

        {/* Features Grid with Enhanced Hover */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          {features.map((feature, idx) => {
            const isRestricted = feature.requiresAuth && !isAuthenticated;
            const FeatureWrapper = isRestricted ? 'div' : Link;
            
            return (
              <FeatureWrapper
                key={idx}
                to={isRestricted ? undefined : feature.link}
                onClick={isRestricted ? (e) => handleFeatureClick(e, feature) : undefined}
                className={`group ${isRestricted ? 'cursor-not-allowed' : ''}`}
                onMouseEnter={() => setHoveredFeature(idx)}
                onMouseLeave={() => setHoveredFeature(null)}
              >
                <GlassCard 
                  hover={!isRestricted}
                  className={`h-full animate-slideUp relative overflow-hidden ${
                    hoveredFeature === idx && !isRestricted ? 'ring-2 ring-purple-500' : ''
                  } ${isRestricted ? 'opacity-60' : ''}`}
                  style={{ animationDelay: `${idx * 0.1}s` }}
                >
                {/* Background Gradient on Hover */}
                <div className={`absolute inset-0 bg-gradient-to-br ${feature.color} opacity-0 group-hover:opacity-10 transition-opacity duration-300`}></div>
                
                <div className="relative z-10">
                  <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${feature.color} flex items-center justify-center text-3xl mb-4 group-hover:scale-110 transition-transform duration-300 relative`}>
                    {feature.icon}
                    {idx < 3 && (
                      <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full animate-pulse"></div>
                    )}
                  </div>
                  <h3 className="text-xl font-bold mb-2 text-white group-hover:text-gradient-warm transition-all">
                    {feature.title}
                  </h3>
                  <p className="text-gray-400 text-sm mb-3">
                    {feature.desc}
                  </p>
                  
                  {/* Stats Badge */}
                  <div className="flex items-center justify-between">
                    <span className={`text-xs px-3 py-1 rounded-full bg-gradient-to-r ${feature.color} text-white font-semibold`}>
                      {feature.stats}
                    </span>
                    {isRestricted ? (
                      <div className="flex items-center text-gray-500 text-sm font-semibold">
                        🔒 Cần đăng nhập
                      </div>
                    ) : (
                      <div className="flex items-center text-purple-400 text-sm font-semibold group-hover:text-pink-400 transition-colors">
                        Khám phá <span className="ml-1 group-hover:ml-2 transition-all">→</span>
                      </div>
                    )}
                  </div>
                  
                  {/* Overlay cho Guest khi hover vào restricted feature */}
                  {isRestricted && hoveredFeature === idx && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-2xl backdrop-blur-sm z-20">
                      <div className="text-center px-4">
                        <div className="text-3xl mb-2">🔒</div>
                        <div className="text-white font-bold text-sm">Cần đăng nhập</div>
                        <div className="text-gray-300 text-xs mt-1">Vui lòng đăng nhập để sử dụng tính năng này</div>
                      </div>
                    </div>
                  )}
                </div>
              </GlassCard>
            </FeatureWrapper>
            );
          })}
        </div>

        {/* Quick Stats with Animation */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-12 animate-slideUp" style={{animationDelay: '0.8s'}}>
          {quickStats.map((stat, idx) => (
            <GlassCard key={idx} className="text-center relative overflow-hidden group cursor-pointer" hover>
              <div className={`absolute inset-0 bg-gradient-to-br ${stat.color} opacity-0 group-hover:opacity-10 transition-opacity duration-300`}></div>
              <div className="relative z-10">
                <div className="text-4xl mb-2">{stat.icon}</div>
                <div className="text-4xl font-black text-gradient mb-2">{stat.value}</div>
                <div className="text-gray-400 mb-2">{stat.label}</div>
                <div className={`text-sm font-bold ${stat.trend.includes('+') ? 'text-green-400' : 'text-blue-400'}`}>
                  {stat.trend}
                </div>
              </div>
            </GlassCard>
          ))}
        </div>

        {/* Why Choose Us Section */}
        <div className="mb-12">
          <h2 className="text-4xl font-black text-center mb-8 text-gradient">
            Tại Sao Chọn VoiceHub?
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { 
                icon: "⚡", 
                title: "Hiệu Suất Cao", 
                desc: "Kiến trúc microservices với độ trễ <50ms",
                features: ["WebSocket real-time", "Redis caching", "CDN global"]
              },
              { 
                icon: "🔒", 
                title: "Bảo Mật Tuyệt Đối", 
                desc: "JWT + RBAC + End-to-end encryption",
                features: ["2FA authentication", "Role-based access", "Data encryption"]
              },
              { 
                icon: "📈", 
                title: "Mở Rộng Linh Hoạt", 
                desc: "Docker Swarm trên AWS Cloud infrastructure",
                features: ["Auto-scaling", "Load balancing", "99.9% uptime"]
              }
            ].map((item, idx) => (
              <GlassCard key={idx} className="animate-slideUp" hover style={{animationDelay: `${(idx + 8) * 0.1}s`}}>
                <div className="text-5xl mb-4">{item.icon}</div>
                <h3 className="text-2xl font-bold text-white mb-2">{item.title}</h3>
                <p className="text-gray-400 mb-4">{item.desc}</p>
                <ul className="space-y-2">
                  {item.features.map((feature, fidx) => (
                    <li key={fidx} className="flex items-center gap-2 text-sm text-gray-300">
                      <div className="w-1.5 h-1.5 bg-purple-500 rounded-full"></div>
                      {feature}
                    </li>
                  ))}
                </ul>
              </GlassCard>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default HomePage;
