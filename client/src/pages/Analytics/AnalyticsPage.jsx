import { useState } from 'react';
import NavigationSidebar from '../../components/Layout/NavigationSidebar';
import { GlassCard, Toast } from '../../components/Shared';

function AnalyticsPage() {
  const [timeRange, setTimeRange] = useState('week');
  const [toast, setToast] = useState(null);

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  return (
    <div className="min-h-screen flex">
      <NavigationSidebar currentPage="Phân Tích" />
      <div className="flex-1 p-6 overflow-y-auto overflow-x-visible scrollbar-gradient">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-black text-gradient mb-2">Phân Tích và Báo Cáo</h1>
            <p className="text-gray-400">Theo dõi hiệu suất và xu hướng tổ chức</p>
          </div>
          <div className="flex gap-3">
            <div className="flex gap-2">
              {[
                { id: 'day', label: 'Ngày' },
                { id: 'week', label: 'Tuần' },
                { id: 'month', label: 'Tháng' },
                { id: 'year', label: 'Năm' }
              ].map(r => (
                <button
                  key={r.id}
                  onClick={() => setTimeRange(r.id)}
                  className={`px-4 py-2 rounded-xl font-semibold transition-all ${
                    timeRange === r.id
                      ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white'
                      : 'glass hover:bg-white/10 text-gray-400'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <button 
              onClick={() => {
                // Simulate export
                const data = {
                  timeRange: timeRange === '7d' ? '7 ngày qua' : timeRange === '30d' ? '30 ngày qua' : '90 ngày qua',
                  exportedAt: new Date().toLocaleString('vi-VN'),
                  stats: { users: 1245, messages: '45.2K', growth: '+24.5%' }
                };
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `analytics-report-${Date.now()}.json`;
                a.click();
                URL.revokeObjectURL(url);
                showToast("Đã xuất báo cáo thành công!", "success");
              }}
              className="glass px-4 py-2 rounded-xl hover:bg-white/10 transition-all font-semibold flex items-center gap-2"
            >
              📊 Xuất Báo Cáo
            </button>
          </div>
        </div>

        {/* Overview Stats */}
        <div className="grid grid-cols-4 gap-6 mb-8">
          {[
            { icon: '📈', label: 'Tăng Trưởng', value: '+24.5%', trend: 'up', color: 'from-green-500 to-emerald-500', detail: 'So với tuần trước' },
            { icon: '👥', label: 'Người Dùng Hoạt Động', value: '1,245', trend: 'up', color: 'from-blue-500 to-cyan-500', detail: '+12% so với trước' },
            { icon: '💬', label: 'Tin Nhắn', value: '45.2K', trend: 'up', color: 'from-purple-600 to-pink-600', detail: '+8% so với trước' },
            { icon: '✅', label: 'Completion Rate', value: '89%', trend: 'up', color: 'from-orange-500 to-yellow-500', detail: '+5% so với trước' }
          ].map((stat, idx) => (
            <GlassCard key={idx} hover glow className="animate-slideUp" style={{animationDelay: `${idx * 0.1}s`}}>
              <div className="flex items-start justify-between mb-4">
                <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${stat.color} flex items-center justify-center text-3xl shadow-lg`}>
                  {stat.icon}
                </div>
                <div className={`px-2 py-1 rounded-lg ${stat.trend === 'up' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'} text-xs font-bold`}>
                  {stat.trend === 'up' ? '↗' : '↘'} {stat.value}
                </div>
              </div>
              <div className="text-sm text-gray-400 mb-1">{stat.label}</div>
              <div className="text-xs text-gray-600">{stat.detail}</div>
            </GlassCard>
          ))}
        </div>

        {/* Charts Grid */}
        <div className="grid grid-cols-2 gap-6 mb-8">
          {/* Task Completion Chart */}
          <GlassCard>
            <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
              <span>✅</span> Hoàn Thành Công Việc
            </h3>
            <div className="grid grid-cols-7 gap-2 h-48">
              {[85, 92, 78, 95, 88, 91, 89].map((value, idx) => (
                <div key={idx} className="flex flex-col items-center justify-end">
                  <div className="text-xs font-bold text-white mb-2">{value}%</div>
                  <div 
                    className="w-full bg-gradient-to-t from-green-500 to-emerald-500 rounded-t-lg transition-all hover:scale-105 cursor-pointer"
                    style={{height: `${value}%`}}
                  ></div>
                  <div className="text-xs text-gray-500 mt-2">
                    {['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][idx]}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t border-white/10 flex items-center justify-between text-sm">
              <span className="text-gray-400">Trung bình tuần: 88.3%</span>
              <span className="text-green-400 font-bold">+2.5% so với trước</span>
            </div>
          </GlassCard>

          {/* Active Users Chart */}
          <GlassCard>
            <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
              <span>👥</span> Người Dùng Hoạt Động
            </h3>
            <div className="grid grid-cols-7 gap-2 h-48">
              {[1120, 1245, 1089, 1356, 1278, 1401, 1245].map((value, idx) => {
                const maxValue = 1500;
                const percentage = (value / maxValue) * 100;
                return (
                  <div key={idx} className="flex flex-col items-center justify-end">
                    <div className="text-xs font-bold text-white mb-2">{value}</div>
                    <div 
                      className="w-full bg-gradient-to-t from-blue-500 to-cyan-500 rounded-t-lg transition-all hover:scale-105 cursor-pointer"
                      style={{height: `${percentage}%`}}
                    ></div>
                    <div className="text-xs text-gray-500 mt-2">
                      {['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][idx]}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 pt-4 border-t border-white/10 flex items-center justify-between text-sm">
              <span className="text-gray-400">Trung bình: 1,248 users/ngày</span>
              <span className="text-blue-400 font-bold">+12% so với trước</span>
            </div>
          </GlassCard>
        </div>

        {/* Department Performance */}
        <GlassCard className="mb-8">
          <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
            <span>🏢</span> Hiệu Suất Theo Phòng Ban
          </h3>
          <div className="space-y-4">
            {[
              { name: 'Kỹ Thuật', tasks: 45, completed: 38, members: 18, progress: 84, color: 'from-purple-600 to-pink-600' },
              { name: 'Thiết Kế', tasks: 32, completed: 30, members: 12, progress: 94, color: 'from-blue-500 to-cyan-500' },
              { name: 'Marketing', tasks: 28, completed: 24, members: 8, progress: 86, color: 'from-green-500 to-emerald-500' },
              { name: 'Sản Phẩm', tasks: 35, completed: 29, members: 7, progress: 83, color: 'from-orange-500 to-yellow-500' }
            ].map((dept, idx) => (
              <div key={idx} className="glass-strong p-4 rounded-xl">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${dept.color} flex items-center justify-center text-xl`}>
                      {['⚙️', '🎨', '📢', '📱'][idx]}
                    </div>
                    <div>
                      <div className="font-bold text-white">{dept.name}</div>
                      <div className="text-xs text-gray-500">{dept.members} thành viên</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-6 text-sm">
                    <div className="text-center">
                      <div className="text-white font-bold">{dept.completed}/{dept.tasks}</div>
                      <div className="text-gray-500 text-xs">Công việc</div>
                    </div>
                    <div className="text-center">
                      <div className="text-green-400 font-bold">{dept.progress}%</div>
                      <div className="text-gray-500 text-xs">Hoàn thành</div>
                    </div>
                  </div>
                </div>
                <div className="w-full h-2 glass-strong rounded-full overflow-hidden">
                  <div 
                    className={`h-full bg-gradient-to-r ${dept.color} transition-all`}
                    style={{width: `${dept.progress}%`}}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </GlassCard>

        {/* Top Contributors */}
        <div className="grid grid-cols-2 gap-6">
          <GlassCard>
            <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
              <span>🏆</span> Người Đóng Góp Nhiều Nhất
            </h3>
            <div className="space-y-3">
              {[
                { name: 'Sarah Chen', avatar: '👩‍💼', tasks: 45, points: 1250, trend: '+15%' },
                { name: 'Mike Ross', avatar: '👨‍💻', tasks: 42, points: 1180, trend: '+12%' },
                { name: 'Emma Wilson', avatar: '👩‍🎨', tasks: 38, points: 1050, trend: '+8%' },
                { name: 'David Kim', avatar: '👨‍🔬', tasks: 35, points: 980, trend: '+10%' }
              ].map((user, idx) => (
                <div key={idx} className="flex items-center gap-4 p-3 glass-strong rounded-xl">
                  <div className="text-2xl font-black text-gradient">#{idx + 1}</div>
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center text-xl">
                    {user.avatar}
                  </div>
                  <div className="flex-1">
                    <div className="font-bold text-white">{user.name}</div>
                    <div className="text-xs text-gray-400">{user.tasks} tasks • {user.points} điểm</div>
                  </div>
                  <div className="text-green-400 text-sm font-bold">{user.trend}</div>
                </div>
              ))}
            </div>
          </GlassCard>

          <GlassCard>
            <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
              <span>📊</span> Hoạt Động Gần Đây
            </h3>
            <div className="space-y-3">
              {[
                { action: 'Task hoàn thành', detail: '38 tasks trong tuần này', icon: '✅', color: 'from-green-500 to-emerald-500' },
                { action: 'Meetings', detail: '24 cuộc họp đã diễn ra', icon: '🎤', color: 'from-blue-500 to-cyan-500' },
                { action: 'Files uploaded', detail: '156 tài liệu mới', icon: '📁', color: 'from-purple-600 to-pink-600' },
                { action: 'Thành viên mới', detail: '+12 người tham gia', icon: '👥', color: 'from-orange-500 to-yellow-500' }
              ].map((activity, idx) => (
                <div key={idx} className="flex items-center gap-4 p-3 glass-strong rounded-xl">
                  <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${activity.color} flex items-center justify-center text-xl`}>
                    {activity.icon}
                  </div>
                  <div className="flex-1">
                    <div className="font-bold text-white">{activity.action}</div>
                    <div className="text-xs text-gray-400">{activity.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>
        </div>
      </div>
      
      {/* Toast */}
      {toast && (
        <Toast 
          message={toast.message} 
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}

// ============= SETTINGS PAGE =============

export default AnalyticsPage;
