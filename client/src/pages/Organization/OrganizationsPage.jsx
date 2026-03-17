import { useState } from 'react';
import { Link } from 'react-router-dom';
import ThreeFrameLayout from '../../components/Layout/ThreeFrameLayout';
import { GlassCard, GradientButton, Modal, Toast } from '../../components/Shared';

function OrganizationsPage() {
  const [viewMode, setViewMode] = useState('grid');
  const [selectedDept, setSelectedDept] = useState(null);
  const [selectedOrg, setSelectedOrg] = useState(null);
  const [showNewDeptModal, setShowNewDeptModal] = useState(false);
  const [showOrgSettings, setShowOrgSettings] = useState(null);
  const [toast, setToast] = useState(null);

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const orgs = [
    { 
      id: 1,
      name: 'VoiceHub Tech', 
      members: 45, 
      icon: '🏢', 
      color: 'from-purple-600 to-pink-600',
      role: 'Quản trị viên',
      departments: 5,
      activeProjects: 12,
      description: 'Công ty công nghệ hàng đầu chuyên về giải pháp truyền thông'
    },
    { 
      id: 2,
      name: 'Đội Sáng Tạo', 
      members: 23, 
      icon: '💡', 
      color: 'from-blue-500 to-cyan-500',
      role: 'Thành viên',
      departments: 3,
      activeProjects: 8,
      description: 'Nhóm thiết kế và phát triển sản phẩm sáng tạo'
    },
    { 
      id: 3,
      name: 'Studio Thiết Kế', 
      members: 12, 
      icon: '🎨', 
      color: 'from-green-500 to-emerald-500',
      role: 'Thành viên',
      departments: 2,
      activeProjects: 5,
      description: 'Chuyên về thiết kế UI/UX và branding'
    }
  ];

  const departments = [
    { name: 'Kỹ Thuật', members: 18, icon: '⚙️', lead: 'Mike Ross' },
    { name: 'Thiết Kế', members: 12, icon: '🎨', lead: 'Sarah Chen' },
    { name: 'Marketing', members: 8, icon: '📢', lead: 'Emma Wilson' },
    { name: 'Sản Phẩm', members: 7, icon: '📱', lead: 'David Kim' }
  ];

  return (
    <>
      <ThreeFrameLayout
        center={
          <div className="p-6">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-black text-gradient mb-2">Tổ Chức và Phòng Ban</h1>
            <p className="text-gray-400">Quản lý cấu trúc tổ chức và thành viên</p>
          </div>
          <div className="flex gap-3">
            <button 
              onClick={() => {
                const newMode = viewMode === 'grid' ? 'list' : 'grid';
                setViewMode(newMode);
                showToast(`Đã chuyển sang chế độ ${newMode === 'grid' ? 'Lưới' : 'Danh sách'}`, "info");
              }}
              className="glass px-4 py-2 rounded-xl hover:bg-white/10 transition-all flex items-center gap-2 font-semibold"
            >
              {viewMode === 'grid' ? '📋 Danh sách' : '📊 Lưới'}
            </button>
            <GradientButton variant="secondary" onClick={() => setShowNewDeptModal(true)}>
              <span className="text-xl mr-2">➡️</span> Tạo Phòng Ban Mới
            </GradientButton>
          </div>
        </div>

        {/* Organizations Grid */}
        <div className={viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8' : 'space-y-4 mb-8'}>
          {orgs.map((org, idx) => (
            <Link key={org.id} to={`/organizations/${org.id}`}>
              <GlassCard hover glow className="animate-slideUp relative overflow-hidden group" style={{animationDelay: `${idx * 0.1}s`}}>
                <div className={`absolute inset-0 bg-gradient-to-br ${org.color} opacity-0 group-hover:opacity-10 transition-opacity`}></div>
                <div className="relative">
                  <div className="flex items-start justify-between mb-4">
                    <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${org.color} flex items-center justify-center text-3xl shadow-lg`}>
                      {org.icon}
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-bold bg-gradient-to-r ${org.color} text-white`}>
                      {org.role}
                    </span>
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2 group-hover:text-gradient transition-colors">{org.name}</h3>
                  <p className="text-gray-400 text-sm mb-4 line-clamp-2">{org.description}</p>
                  
                  <div className="grid grid-cols-3 gap-2 mb-4">
                    <div className="text-center">
                      <div className="text-2xl font-black text-white">{org.members}</div>
                      <div className="text-xs text-gray-500">Thành viên</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-black text-white">{org.departments}</div>
                      <div className="text-xs text-gray-500">Phòng ban</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-black text-white">{org.activeProjects}</div>
                      <div className="text-xs text-gray-500">Dự án</div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button 
                      onClick={(e) => {
                        e.preventDefault();
                        setSelectedOrg(org);
                      }}
                      className="flex-1 py-2 glass rounded-lg hover:bg-white/10 transition-all text-sm font-semibold"
                    >
                      Chi tiết
                    </button>
                    <button 
                      onClick={(e) => {
                        e.preventDefault();
                        setShowOrgSettings(org);
                      }}
                      className="flex-1 py-2 glass rounded-lg hover:bg-white/10 transition-all text-sm font-semibold"
                    >
                      Cài đặt
                    </button>
                  </div>
                </div>
              </GlassCard>
            </Link>
          ))}
        </div>

        {/* Departments Section */}
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
            <span>🏛️</span> Phòng Ban
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {departments.map((dept, idx) => (
              <GlassCard key={idx} hover className="cursor-pointer group" onClick={() => setSelectedDept(dept)}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center text-2xl">
                    {dept.icon}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-bold text-white group-hover:text-gradient transition-colors">{dept.name}</h3>
                    <p className="text-gray-400 text-xs">{dept.members} thành viên</p>
                  </div>
                </div>
                <div className="text-xs text-gray-500 flex items-center gap-1">
                  <span>👤</span>
                  <span>Trưởng phòng: {dept.lead}</span>
                </div>
              </GlassCard>
            ))}
          </div>
        </div>

        {/* Organization Chart Preview */}
        <GlassCard>
          <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
            <span>📊</span> Sơ Đồ Tổ Chức
          </h2>
          <div className="flex flex-col items-center gap-6">
            {/* CEO Level */}
            <div className="glass-strong px-6 py-4 rounded-xl text-center">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center text-2xl mx-auto mb-2">
                👨‍💼
              </div>
              <div className="font-bold text-white">Giám Đốc Điều Hành</div>
              <div className="text-xs text-gray-400">John Smith</div>
            </div>

            {/* Department Heads */}
            <div className="grid grid-cols-4 gap-4 w-full">
              {departments.map((dept, idx) => (
                <div key={idx} className="glass-strong px-4 py-3 rounded-xl text-center">
                  <div className="text-3xl mb-2">{dept.icon}</div>
                  <div className="font-semibold text-white text-sm">{dept.name}</div>
                  <div className="text-xs text-gray-500">{dept.lead}</div>
                </div>
              ))}
            </div>
          </div>
        </GlassCard>
      </div>
        }
      />

      {/* Organization Detail Modal */}
      <Modal
        isOpen={selectedOrg !== null}
        onClose={() => setSelectedOrg(null)}
        title={selectedOrg?.name || "Chi Tiết Tổ Chức"}
        size="lg"
      >
        {selectedOrg && (
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <div className={`w-20 h-20 rounded-2xl bg-gradient-to-br ${selectedOrg.color} flex items-center justify-center text-4xl`}>
                {selectedOrg.icon}
              </div>
              <div className="flex-1">
                <h3 className="text-2xl font-bold text-white mb-1">{selectedOrg.name}</h3>
                <p className="text-gray-400">{selectedOrg.description}</p>
                <span className={`inline-block mt-2 px-3 py-1 rounded-full text-xs font-bold bg-gradient-to-r ${selectedOrg.color} text-white`}>
                  {selectedOrg.role}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <GlassCard>
                <div className="text-3xl font-black text-white text-center mb-1">{selectedOrg.members}</div>
                <div className="text-sm text-gray-400 text-center">Thành viên</div>
              </GlassCard>
              <GlassCard>
                <div className="text-3xl font-black text-white text-center mb-1">{selectedOrg.departments}</div>
                <div className="text-sm text-gray-400 text-center">Phòng ban</div>
              </GlassCard>
              <GlassCard>
                <div className="text-3xl font-black text-white text-center mb-1">{selectedOrg.activeProjects}</div>
                <div className="text-sm text-gray-400 text-center">Dự án đang hoạt động</div>
              </GlassCard>
            </div>

            <GlassCard>
              <h4 className="font-bold text-white mb-3">Hoạt động gần đây</h4>
              <div className="space-y-2 text-sm text-gray-400">
                <div>• 3 dự án mới được tạo tuần này</div>
                <div>• 5 thành viên mới tham gia</div>
                <div>• 12 công việc đã hoàn thành</div>
              </div>
            </GlassCard>

            <div className="flex gap-3">
              <GradientButton variant="primary" onClick={() => {
                setSelectedOrg(null);
                showToast("Chuyển đến trang chi tiết tổ chức", "info");
              }}>
                Xem Đầy Đủ
              </GradientButton>
              <button 
                onClick={() => setSelectedOrg(null)}
                className="flex-1 py-3 glass rounded-xl hover:bg-white/10 transition-all font-semibold"
              >
                Đóng
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Organization Settings Modal */}
      <Modal
        isOpen={showOrgSettings !== null}
        onClose={() => setShowOrgSettings(null)}
        title={`Cài Đặt - ${showOrgSettings?.name || ""}`}
        size="lg"
      >
        {showOrgSettings && (
          <div className="space-y-6">
            <GlassCard>
              <h4 className="font-bold text-white mb-4">Thông Tin Cơ Bản</h4>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Tên tổ chức</label>
                  <input 
                    type="text" 
                    defaultValue={showOrgSettings.name}
                    className="w-full px-4 py-2 glass rounded-lg border border-white/20 focus:border-purple-500 outline-none text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Mô tả</label>
                  <textarea 
                    defaultValue={showOrgSettings.description}
                    className="w-full px-4 py-2 glass rounded-lg border border-white/20 focus:border-purple-500 outline-none text-white resize-none"
                    rows="3"
                  />
                </div>
              </div>
            </GlassCard>

            <GlassCard>
              <h4 className="font-bold text-white mb-4">Quyền Truy Cập</h4>
              <div className="space-y-2">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" className="w-4 h-4" defaultChecked />
                  <span className="text-gray-300">Cho phép thành viên mời người khác</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" className="w-4 h-4" defaultChecked />
                  <span className="text-gray-300">Hiển thị công khai</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" className="w-4 h-4" />
                  <span className="text-gray-300">Yêu cầu phê duyệt khi tham gia</span>
                </label>
              </div>
            </GlassCard>

            <div className="flex gap-3">
              <GradientButton variant="primary" onClick={() => {
                setShowOrgSettings(null);
                showToast("Đã lưu cài đặt thành công!", "success");
              }}>
                Lưu Thay Đổi
              </GradientButton>
              <button 
                onClick={() => setShowOrgSettings(null)}
                className="flex-1 py-3 glass rounded-xl hover:bg-white/10 transition-all font-semibold"
              >
                Hủy
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* New Department Modal */}
      <Modal
        isOpen={showNewDeptModal}
        onClose={() => setShowNewDeptModal(false)}
        title="Tạo Phòng Ban Mới"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Tên phòng ban</label>
            <input 
              type="text" 
              placeholder="Ví dụ: Phòng Kỹ Thuật"
              className="w-full px-4 py-2 glass rounded-lg border border-white/20 focus:border-purple-500 outline-none text-white"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Trưởng phòng</label>
            <input 
              type="text" 
              placeholder="Chọn thành viên..."
              className="w-full px-4 py-2 glass rounded-lg border border-white/20 focus:border-purple-500 outline-none text-white"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Mô tả</label>
            <textarea 
              placeholder="Mô tả ngắn về phòng ban..."
              className="w-full px-4 py-2 glass rounded-lg border border-white/20 focus:border-purple-500 outline-none text-white resize-none"
              rows="3"
            />
          </div>
          <div className="flex gap-3 mt-6">
            <GradientButton variant="primary" onClick={() => {
              setShowNewDeptModal(false);
              showToast("Đã tạo phòng ban mới thành công!", "success");
            }}>
              Tạo Phòng Ban
            </GradientButton>
            <button 
              onClick={() => setShowNewDeptModal(false)}
              className="flex-1 py-3 glass rounded-xl hover:bg-white/10 transition-all font-semibold"
            >
              Hủy
            </button>
          </div>
        </div>
      </Modal>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </>
  );
}

function OrganizationDetailPage() {
  return (
    <ThreeFrameLayout
      center={
        <div className="p-6">
        <Link to="/organizations" className="text-purple-400 hover:text-pink-400 mb-4 inline-block">← Quay Lại</Link>
        <h1 className="text-4xl font-black text-gradient mb-6">Công Ty Mẫu</h1>
        <div className="grid gap-6">
          <GlassCard>
            <h2 className="text-2xl font-bold text-white mb-4">Phòng Ban</h2>
            <div className="grid grid-cols-3 gap-4">
              {[
                { name: 'Kỹ Thuật', members: 12 },
                { name: 'Thiết Kế', members: 12 },
                { name: 'Marketing', members: 12 }
              ].map((dept, idx) => (
                <div key={idx} className="glass p-4 rounded-xl hover:bg-white/5 transition-all cursor-pointer">
                  <h3 className="font-bold text-white">{dept.name}</h3>
                  <p className="text-gray-400 text-sm">{dept.members} thành viên</p>
                </div>
              ))}
            </div>
          </GlassCard>
        </div>
      </div>
      }
    />
  );
}

export default OrganizationsPage;
