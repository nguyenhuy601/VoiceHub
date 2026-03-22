import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import NavigationSidebar from '../../components/Layout/NavigationSidebar';
import { Dropdown, GlassCard, GradientButton, Modal, StatusIndicator, Toast } from '../../components/Shared';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import organizationService from '../../services/organizationService';
import userService from '../../services/userService';

// Theo cấu hình hiện tại, Tasks/Documents đang được ẩn tạm thời.
// Chỉ bật lại khi set VITE_ENABLE_TASKS_DOCS=true
const ENABLE_TASKS_DOCS = import.meta.env.VITE_ENABLE_TASKS_DOCS === 'true';

const DEFAULT_PROJECTS = [
  { name: 'VoiceHub Enterprise', progress: 75, members: 8, deadline: '2 ngày' },
  { name: 'Chiến Dịch Marketing Q1', progress: 60, members: 5, deadline: '5 ngày' },
  { name: 'Thiết Kế Lại Ứng Dụng Di Động', progress: 40, members: 6, deadline: '1 tuần' },
];

const DEFAULT_ACTIVITIES = [
  { user: 'Sarah Chen', action: 'hoàn thành', item: 'Đánh giá thiết kế UI', time: '2 phút trước', avatar: '👩‍💼', type: 'task', color: 'from-green-500 to-emerald-500', detail: { project: 'VoiceHub Enterprise', duration: '2 giờ', tags: ['Thiết Kế', 'Đánh Giá'] } },
  { user: 'Mike Ross', action: 'tải lên', item: 'BaoCaoQ4.pdf', time: '15 phút trước', avatar: '👨‍💻', type: 'file', color: 'from-blue-500 to-cyan-500', detail: { size: '2.4 MB', folder: 'Tài Liệu/Báo Cáo', downloads: 5 } },
  { user: 'Emma Wilson', action: 'tạo kênh', item: '#y-tuong-marketing', time: '1 giờ trước', avatar: '👩‍🎨', type: 'message', color: 'from-purple-600 to-pink-600', detail: { members: 8, category: 'Marketing', description: 'Tổng kết ý tưởng chiến dịch' } },
  { user: 'David Kim', action: 'tham gia', item: 'Họp Nhóm Hàng Ngày', time: '2 giờ trước', avatar: '👨‍🔬', type: 'task', color: 'from-orange-500 to-red-500', detail: { duration: '30 phút', participants: 12, recording: true } },
  { user: 'Lisa Park', action: 'comment', item: 'Dự án Website mới', time: '3 giờ trước', avatar: '👩‍💼', type: 'message', color: 'from-pink-500 to-rose-500', detail: { comments: 3, mentions: ['@Mike', '@Sarah'], project: 'Thiết Kế Lại Website' } },
];

function DashboardPage() {
  const teamMembers = ['👩‍💼 Sarah', '👨‍💻 Mike', '👩‍🎨 Emma', '👨‍🔬 David'];
  const uploadInputRef = useRef(null);
  const [activeFilter, setActiveFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStat, setSelectedStat] = useState(null);
  const [showActivityDetail, setShowActivityDetail] = useState(null);
  const [toast, setToast] = useState(null);
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [newProjectForm, setNewProjectForm] = useState({
    name: '',
    description: '',
    startDate: '',
    deadline: '',
  });
  const [selectedProjectMembers, setSelectedProjectMembers] = useState(['👩‍💼 Sarah']);
  const [activeOrganizationId, setActiveOrganizationId] = useState(null);
  const [projects, setProjects] = useState(DEFAULT_PROJECTS);
  const [activities, setActivities] = useState(DEFAULT_ACTIVITIES);
  const [showWelcome, setShowWelcome] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();

  const displayName =
    user?.fullName ||
    user?.name ||
    user?.displayName ||
    user?.email?.split('@')[0] ||
    'bạn';

  const getGreeting = () => {
    const now = new Date();
    const hour = now.getHours();
    if (hour >= 5 && hour < 11) return `Chào buổi Sáng, ${displayName}!`;
    if (hour >= 11 && hour < 13) return `Chào buổi Trưa, ${displayName}!`;
    if (hour >= 13 && hour < 17) return `Chào buổi Chiều, ${displayName}!`;
    if (hour >= 17 && hour < 22) return `Chào buổi Tối, ${displayName}!`;
    return `Khuya rồi, ${displayName}!`;
  };

  const extractData = (response) => response?.data ?? response;

  const getEntityId = (entity) =>
    String(entity?._id || entity?.id || entity?.organizationId || '').trim();

  const formatRelativeTime = (input) => {
    if (!input) return 'Vừa xong';
    const target = new Date(input).getTime();
    if (!Number.isFinite(target)) return 'Vừa xong';

    const diffMs = Date.now() - target;
    const diffMinutes = Math.max(1, Math.floor(diffMs / 60000));
    if (diffMinutes < 60) return `${diffMinutes} phút trước`;

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours} giờ trước`;

    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} ngày trước`;
  };

  const mapOrganizationToProject = (organization) => {
    const id = getEntityId(organization);
    const createdAt = organization?.createdAt ? new Date(organization.createdAt) : null;
    const ageInDays = createdAt ? Math.max(1, Math.ceil((Date.now() - createdAt.getTime()) / 86400000)) : 1;
    const progress = Math.max(10, Math.min(95, ageInDays * 3));

    return {
      id,
      name: organization?.name || 'Dự án chưa đặt tên',
      progress,
      members: Number(organization?.memberCount || 1),
      deadline: organization?.updatedAt
        ? new Date(organization.updatedAt).toLocaleDateString('vi-VN')
        : 'Đang hoạt động',
    };
  };

  const mapTaskToActivity = (task) => ({
    id: getEntityId(task),
    user: displayName,
    action: 'tạo công việc',
    item: task?.title || 'Công việc mới',
    time: formatRelativeTime(task?.createdAt),
    avatar: '🧑',
    type: 'task',
    color: 'from-green-500 to-emerald-500',
    detail: {
      status: task?.status || 'todo',
      priority: task?.priority || 'medium',
      dueDate: task?.dueDate ? new Date(task.dueDate).toLocaleDateString('vi-VN') : 'Chưa đặt',
    },
    _createdAt: task?.createdAt || new Date().toISOString(),
  });

  const mapDocumentToActivity = (document) => ({
    id: getEntityId(document),
    user: displayName,
    action: 'tải lên',
    item: document?.name || 'Tệp mới',
    time: formatRelativeTime(document?.createdAt),
    avatar: '🧑',
    type: 'file',
    color: 'from-blue-500 to-cyan-500',
    detail: {
      size: document?.fileSize
        ? `${(Number(document.fileSize) / 1024 / 1024).toFixed(2)} MB`
        : 'Không rõ',
      folder: 'Kho tài liệu',
      mimeType: document?.mimeType || 'application/octet-stream',
    },
    _createdAt: document?.createdAt || new Date().toISOString(),
  });

  useEffect(() => {
    // Chỉ hiển thị modal chào khi vừa đăng nhập / lần đầu vào web trong phiên này
    const seen = localStorage.getItem('vh_seen_welcome');
    if (!seen) {
      setShowWelcome(true);
      localStorage.setItem('vh_seen_welcome', '1');
    }

    const loadDashboardData = async () => {
      try {
        const organizationsResp = await organizationService.getMyOrganizations();
        const organizationsData = extractData(organizationsResp);
        const organizationList = Array.isArray(organizationsData)
          ? organizationsData
          : Array.isArray(organizationsData?.data)
            ? organizationsData.data
            : [];

        if (organizationList.length > 0) {
          const mappedProjects = organizationList.map(mapOrganizationToProject);
          setProjects(mappedProjects);

          const firstOrganizationId = mappedProjects[0]?.id || getEntityId(organizationList[0]);
          if (firstOrganizationId) {
            setActiveOrganizationId(firstOrganizationId);

            if (ENABLE_TASKS_DOCS) {
              const [tasksResp, documentsResp] = await Promise.allSettled([
                api.get('/tasks', {
                  params: {
                    organizationId: firstOrganizationId,
                    limit: 8,
                  },
                }),
                api.get('/documents', {
                  params: {
                    organizationId: firstOrganizationId,
                    limit: 8,
                  },
                }),
              ]);

              const taskData = tasksResp.status === 'fulfilled' ? extractData(tasksResp.value) : null;
              const documentData =
                documentsResp.status === 'fulfilled' ? extractData(documentsResp.value) : null;

              const tasks = Array.isArray(taskData?.tasks)
                ? taskData.tasks
                : Array.isArray(taskData?.data?.tasks)
                  ? taskData.data.tasks
                  : [];
              const documents = Array.isArray(documentData?.documents)
                ? documentData.documents
                : Array.isArray(documentData?.data?.documents)
                  ? documentData.data.documents
                  : [];

              const mergedActivities = [
                ...tasks.map(mapTaskToActivity),
                ...documents.map(mapDocumentToActivity),
              ]
                .sort((a, b) => new Date(b._createdAt).getTime() - new Date(a._createdAt).getTime())
                .slice(0, 20)
                .map(({ _createdAt, ...activity }) => activity);

              if (mergedActivities.length > 0) {
                setActivities(mergedActivities);
              }
            }
          }
        }
      } catch (error) {
        showToast(error?.message || 'Không tải được dữ liệu dashboard từ máy chủ', 'error');
      }
    };

    loadDashboardData();
  }, []);

  const showToast = (message, type = "success") => {
    setToast({ message, type });
  };

  const handleCustomizeDashboard = () => {
    navigate('/settings');
    showToast('Đã mở cài đặt để tùy chỉnh dashboard', 'info');
  };

  const handleExportReport = () => {
    const rows = [
      ['loai', 'ten', 'gia_tri'],
      ...stats.map((stat) => ['stat', stat.label, stat.value]),
      ...projects.map((project) => ['project', project.name, `${project.progress}%`]),
      ...activities.slice(0, 10).map((activity) => ['activity', `${activity.user} ${activity.action}`, activity.item]),
    ];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `dashboard-report-${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    showToast('Đã xuất báo cáo dashboard', 'success');
  };

  const handleShareDashboard = async () => {
    const shareUrl = `${window.location.origin}/dashboard`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      showToast('Đã sao chép liên kết chia sẻ dashboard', 'success');
    } catch {
      showToast('Không thể sao chép liên kết chia sẻ', 'error');
    }
  };

  const handleOpenSettings = () => {
    navigate('/settings');
  };

  const stats = useMemo(() => [
    { 
      icon: "📊", 
      label: "Dự Án Hoạt Động", 
      value: String(projects.length), 
      change: "+2.5%", 
      color: "from-purple-600 to-pink-600",
      trend: "up",
      detail: "3 sắp deadline",
      drilldown: {
        total: projects.length,
        dangHoatDong: 9,
        tamDung: 2,
        hoanThanh: 45,
        projects
      }
    },
    { 
      icon: "✅", 
      label: "Công Việc Hoàn Thành", 
      value: "89", 
      change: "+12%", 
      color: "from-blue-500 to-cyan-500",
      trend: "up",
      detail: "Tuần này",
      drilldown: {
        homNay: 15,
        tuan: 89,
        thang: 342,
        nguoiDongGopNhieuNhat: [
          { name: "Sarah Chen", tasks: 25, avatar: "👩‍💼" },
          { name: "Mike Ross", tasks: 18, avatar: "👨‍💻" },
          { name: "Emma Wilson", tasks: 16, avatar: "👩‍🎨" }
        ]
      }
    },
    { 
      icon: "👥", 
      label: "Thành Viên", 
      value: "24", 
      change: "+3", 
      color: "from-green-500 to-emerald-500",
      trend: "up",
      detail: "18 online",
      drilldown: {
        total: 24,
        trucTuyen: 18,
        ban: 4,
        vangMat: 2,
        roles: [
          { name: "Lập Trình Viên", count: 12, online: 9 },
          { name: "Thiết Kế Viên", count: 6, online: 5 },
          { name: "Quản Lý", count: 4, online: 3 },
          { name: "QA", count: 2, online: 1 }
        ]
      }
    },
    { 
      icon: "💬", 
      label: "Tin Nhắn Mới", 
      value: "156", 
      change: "+45%", 
      color: "from-orange-500 to-red-500",
      trend: "up",
      detail: "Hôm nay",
      drilldown: {
        homNay: 156,
        chuaDoc: 42,
        channels: [
          { name: "#general", messages: 45, unread: 12 },
          { name: "#dev-team", messages: 38, unread: 15 },
          { name: "#design", messages: 28, unread: 8 },
          { name: "#random", messages: 45, unread: 7 }
        ]
      }
    }
  ], [projects]);

  const addActivity = (activity) => {
    setActivities((prev) => [activity, ...prev]);
  };

  const handleOpenAnalytics = () => {
    setSelectedStat(stats[0]);
    showToast('Đã mở phân tích nhanh của dashboard', 'info');
  };

  const handleUploadButtonClick = () => {
    uploadInputRef.current?.click();
  };

  const ensureActiveOrganization = async () => {
    if (activeOrganizationId) return activeOrganizationId;

    const organizationsResp = await organizationService.getMyOrganizations();
    const organizationsData = extractData(organizationsResp);
    const organizationList = Array.isArray(organizationsData)
      ? organizationsData
      : Array.isArray(organizationsData?.data)
        ? organizationsData.data
        : [];

    if (organizationList.length > 0) {
      const firstId = getEntityId(organizationList[0]);
      if (firstId) {
        setActiveOrganizationId(firstId);
        return firstId;
      }
    }

    throw new Error('Bạn cần tạo dự án trước khi thực hiện thao tác này');
  };

  const handleUploadFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const organizationId = await ensureActiveOrganization();
      const pseudoFileUrl = `local://dashboard-upload/${Date.now()}-${encodeURIComponent(file.name)}`;

      const createDocumentResp = await api.post('/documents', {
        name: file.name,
        description: `Tải lên từ dashboard bởi ${displayName}`,
        organizationId,
        fileUrl: pseudoFileUrl,
        fileSize: file.size || 0,
        mimeType: file.type || 'application/octet-stream',
        tags: ['dashboard', 'upload'],
        isPublic: false,
      });

      const createdDocumentPayload = extractData(createDocumentResp);
      const createdDocument = createdDocumentPayload?.data || createdDocumentPayload;

      addActivity({
        user: displayName,
        action: 'tải lên',
        item: createdDocument?.name || file.name,
        time: 'Vừa xong',
        avatar: '🧑',
        type: 'file',
        color: 'from-blue-500 to-cyan-500',
        detail: {
          size: `${(file.size / 1024 / 1024).toFixed(2)} MB`,
          folder: 'Kho tài liệu',
          documentId: getEntityId(createdDocument),
        },
      });
      showToast('Đã lưu metadata tệp vào MongoDB thành công', 'success');
    } catch (error) {
      showToast(error?.response?.data?.message || error?.message || 'Không thể tải tệp lên', 'error');
    } finally {
      event.target.value = '';
    }
  };

  const handleCreateProject = async () => {
    const projectName = String(newProjectForm.name || '').trim();
    if (!projectName) {
      showToast('Vui lòng nhập tên dự án', 'error');
      return;
    }

    try {
      const createResp = await organizationService.createOrganization({
        name: projectName,
        description: String(newProjectForm.description || '').trim(),
      });
      const createPayload = extractData(createResp);
      const createdOrganization = createPayload?.data || createPayload;
      const createdProject = mapOrganizationToProject(createdOrganization);

      setProjects((prev) => [createdProject, ...prev.filter((item) => item.id !== createdProject.id)]);
      if (createdProject.id) {
        setActiveOrganizationId(createdProject.id);
      }

      addActivity({
        user: displayName,
        action: 'tạo dự án',
        item: createdProject.name,
        time: 'Vừa xong',
        avatar: '🧑',
        type: 'task',
        color: 'from-violet-500 to-indigo-500',
        detail: {
          projectId: createdProject.id,
          description: newProjectForm.description || 'Không có mô tả',
        },
      });

      setNewProjectForm({ name: '', description: '', startDate: '', deadline: '' });
      setSelectedProjectMembers(['👩‍💼 Sarah']);
      setShowNewProjectModal(false);
      showToast('Tạo dự án thành công và đã lưu vào MongoDB', 'success');
    } catch (error) {
      showToast(error?.response?.data?.message || error?.message || 'Không thể tạo dự án', 'error');
    }
  };

  const handleToggleProjectMember = (member) => {
    setSelectedProjectMembers((prev) => (
      prev.includes(member)
        ? prev.filter((item) => item !== member)
        : [...prev, member]
    ));
  };

  const handleOpenTeamChat = (name) => {
    navigate('/chat/friends');
    showToast(`Đang mở chat với ${name}`, 'info');
  };

  const handleJoinUpcomingEvent = (title) => {
    navigate('/voice');
    showToast(`Đang tham gia ${title}`, 'success');
  };

  const handleViewAllActivities = () => {
    setActiveFilter('all');
    setSearchQuery('');
    showToast('Đã hiển thị tất cả hoạt động', 'info');
  };

  const handleShareActivity = async (activity) => {
    if (!activity) return;
    const summary = `${activity.user} ${activity.action} ${activity.item} (${activity.time})`;
    try {
      await navigator.clipboard.writeText(summary);
      showToast('Đã sao chép nội dung hoạt động', 'success');
    } catch {
      showToast('Không thể sao chép nội dung hoạt động', 'error');
    }
  };

  const handleInviteMember = async () => {
    const keyword = String(inviteEmail || '').trim();
    if (!keyword) {
      showToast('Vui lòng nhập username, tên hiển thị hoặc số điện thoại', 'error');
      return;
    }

    try {
      const organizationId = await ensureActiveOrganization();
      const searchTerms = keyword.includes('@')
        ? [keyword, keyword.split('@')[0]].filter(Boolean)
        : [keyword];

      let users = [];
      for (const term of searchTerms) {
        const searchResp = await userService.searchUsers(encodeURIComponent(term));
        const searchPayload = extractData(searchResp);
        users = Array.isArray(searchPayload?.users)
          ? searchPayload.users
          : Array.isArray(searchPayload?.data?.users)
            ? searchPayload.data.users
            : [];
        if (users.length > 0) break;
      }

      const targetUser = users[0];
      const targetUserId =
        targetUser?.userId || targetUser?._id || targetUser?.id || targetUser?.profileId || null;

      if (!targetUserId) {
        showToast('Không tìm thấy người dùng phù hợp để mời', 'error');
        return;
      }

      await organizationService.inviteMember(organizationId, targetUserId, 'member');

      addActivity({
        user: displayName,
        action: 'mời thành viên',
        item: targetUser.displayName || targetUser.username || keyword,
        time: 'Vừa xong',
        avatar: '🧑',
        type: 'message',
        color: 'from-green-500 to-emerald-500',
        detail: {
          userId: String(targetUserId),
          status: 'Đã gửi lời mời',
        },
      });

      setInviteEmail('');
      setShowInviteModal(false);
      showToast('Đã tạo lời mời thành viên trong MongoDB', 'success');
    } catch (error) {
      const statusCode = error?.response?.status;
      if (statusCode === 409) {
        showToast('Người dùng đã ở trong tổ chức này', 'info');
        return;
      }
      showToast(error?.response?.data?.message || error?.message || 'Không thể mời thành viên', 'error');
    }
  };

  const handleOpenActivityTarget = (activity) => {
    if (!activity) return;

    if (activity.type === 'message') {
      navigate('/chat/friends');
      return;
    }

    if (activity.type === 'task') {
      navigate('/organizations');
      return;
    }

    if (activity.type === 'file') {
      handleUploadButtonClick();
      return;
    }

    showToast('Đang chuyển đến chi tiết...', 'info');
  };

  const normalizedSearch = searchQuery.trim().toLowerCase();

  const filteredActivities = activities.filter((a) => {
    const matchedType =
      activeFilter === 'all'
        ? true
        : activeFilter === 'tasks'
          ? a.type === 'task'
          : activeFilter === 'messages'
            ? a.type === 'message'
            : activeFilter === 'files'
              ? a.type === 'file'
              : true;

    if (!matchedType) return false;
    if (!normalizedSearch) return true;

    return [a.user, a.action, a.item, a.type]
      .filter(Boolean)
      .some((field) => String(field).toLowerCase().includes(normalizedSearch));
  });

  return (
    <>
    {/* Bố cục chuẩn 3 khung: cùng độ dài với sidebar, mỗi khung thanh trượt riêng */}
    <div className="h-screen flex overflow-hidden bg-[#020817]">
      {/* Khung 1: Sidebar nav (icon only) */}
      <NavigationSidebar />

      {/* Khung 2: Trung tâm điều khiển - cuộn riêng */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <div className="flex-1 min-h-0 p-5 lg:p-6 overflow-y-auto overflow-x-visible scrollbar-overlay">
          {/* Header with Search */}
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-extrabold text-white mb-1">Trung Tâm Điều Khiển</h1>
              <p className="text-sm text-gray-400">Giám sát không gian làm việc thời gian thực</p>
            </div>
            <div className="flex gap-3">
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm kiếm..."
                  className="pl-9 pr-4 py-2.5 rounded-xl bg-[#040f2a] border border-slate-800 focus:border-indigo-500 outline-none text-sm text-white w-56"
                />
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">🔍</span>
              </div>
              <Dropdown
                trigger={
                  <button className="bg-[#040f2a] border border-slate-800 px-3.5 py-2.5 rounded-xl hover:bg-slate-800/70 transition-all">
                    <span className="text-base">⚙️</span>
                  </button>
                }
                align="right"
              >
                <div className="p-2">
                  <button onClick={handleCustomizeDashboard} className="w-full text-left px-4 py-2 rounded-lg hover:bg-white/10 transition-all text-white">Tùy Chỉnh Dashboard</button>
                  <button onClick={handleExportReport} className="w-full text-left px-4 py-2 rounded-lg hover:bg-white/10 transition-all text-white">Xuất Báo Cáo</button>
                  <button onClick={handleShareDashboard} className="w-full text-left px-4 py-2 rounded-lg hover:bg-white/10 transition-all text-white">Chia Sẻ</button>
                  <div className="h-px bg-white/10 my-2"></div>
                  <button onClick={handleOpenSettings} className="w-full text-left px-4 py-2 rounded-lg hover:bg-white/10 transition-all text-white">Cài Đặt</button>
                </div>
              </Dropdown>
            </div>
          </div>

          {/* Enhanced Stats Grid with Click to Drilldown */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
            {stats.map((stat, idx) => (
              <GlassCard 
                key={idx} 
                hover 
                onClick={() => setSelectedStat(stat)}
                className="animate-slideUp relative overflow-hidden group cursor-pointer border border-slate-800 bg-slate-900/60" 
                style={{animationDelay: `${idx * 0.1}s`}}
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${stat.color} opacity-0 group-hover:opacity-10 transition-opacity`}></div>
                <div className="relative z-10">
                  <div className="flex items-center justify-between mb-2.5">
                    <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${stat.color} flex items-center justify-center text-xl shadow-lg`}>
                      {stat.icon}
                    </div>
                    <div className={`flex items-center gap-1 text-xs font-bold ${stat.trend === 'up' ? 'text-green-400' : 'text-red-400'}`}>
                      <span>{stat.trend === 'up' ? '↗' : '↘'}</span>
                      <span>{stat.change}</span>
                    </div>
                  </div>
                  <div className="text-2xl font-extrabold text-white mb-1">{stat.value}</div>
                  <div className="text-gray-400 text-xs mb-2">{stat.label}</div>
                  <div className="text-xs text-gray-500">{stat.detail}</div>
                  <div className="mt-2 text-[11px] text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity">
                    Click để xem chi tiết →
                  </div>
                </div>
              </GlassCard>
            ))}
          </div>

          {/* Activity Feed with Filters */}
          <GlassCard className="mb-6 border border-slate-800 bg-slate-900/60">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-xl font-bold text-white">Hoạt Động Gần Đây</h2>
              <div className="flex gap-2">
                {['all', 'tasks', 'messages', 'files'].map(filter => (
                  <button
                    key={filter}
                    onClick={() => setActiveFilter(filter)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      activeFilter === filter
                        ? 'bg-gradient-to-r from-violet-500 to-indigo-500 text-white'
                        : 'bg-[#040f2a] border border-slate-800 hover:bg-slate-800/70 text-gray-400'
                    }`}
                  >
                    {filter === 'all' ? 'Tất cả' : filter === 'tasks' ? 'Công việc' : filter === 'messages' ? 'Tin nhắn' : 'Tệp'}
                  </button>
                ))}
              </div>
            </div>
            
            <div className="space-y-3">
              {filteredActivities.map((activity, idx) => (
                <div
                  key={idx} 
                  onClick={() => setShowActivityDetail(activity)}
                  className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-all cursor-pointer group"
                >
                  <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${activity.color} flex items-center justify-center text-xl shadow-lg relative`}>
                    {activity.avatar}
                    <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-[#0a0118]"></div>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-white mb-1">
                      <span className="font-bold">{activity.user}</span>
                      <span className="text-gray-400"> {activity.action} </span>
                      <span className="text-indigo-400 font-semibold">{activity.item}</span>
                    </p>
                    <div className="flex items-center gap-3">
                      <span className="text-gray-500 text-sm">{activity.time}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full bg-gradient-to-r ${activity.color} text-white`}>
                        {activity.type === 'task' ? 'Công việc' : activity.type === 'file' ? 'Tệp' : 'Tin nhắn'}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      setShowActivityDetail(activity);
                    }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity bg-[#040f2a] border border-slate-800 px-3 py-1.5 rounded-lg text-xs text-gray-200 hover:text-white"
                  >
                    Chi tiết
                  </button>
                </div>
              ))}
            </div>

            <button onClick={handleViewAllActivities} className="w-full mt-3 py-2.5 bg-[#040f2a] border border-slate-800 rounded-xl hover:bg-slate-800/70 transition-all text-sm text-gray-400 hover:text-white">
              Xem tất cả hoạt động →
            </button>
          </GlassCard>

          {/* Quick Actions Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            {[
              { icon: "➕", label: "Dự Án Mới", color: "from-purple-600 to-pink-600", action: () => setShowNewProjectModal(true) },
              { icon: "📊", label: "Phân Tích", color: "from-blue-500 to-cyan-500", action: handleOpenAnalytics },
              { icon: "👥", label: "Mời Thành Viên", color: "from-green-500 to-emerald-500", action: () => setShowInviteModal(true) },
              { icon: "📁", label: "Tải Lên", color: "from-orange-500 to-red-500", action: handleUploadButtonClick }
            ].map((action, idx) => (
              <button
                key={idx}
                onClick={action.action}
                className="bg-slate-900/60 border border-slate-800 p-3 rounded-xl hover:bg-slate-800/70 transition-all group animate-scaleIn"
                style={{animationDelay: `${(idx + 4) * 0.1}s`}}
              >
                <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${action.color} flex items-center justify-center text-xl mb-2 mx-auto group-hover:scale-110 transition-transform`}>
                  {action.icon}
                </div>
                <div className="text-xs font-semibold text-gray-400 group-hover:text-white transition-colors">
                  {action.label}
                </div>
              </button>
            ))}
          </div>

          <input
            ref={uploadInputRef}
            type="file"
            className="hidden"
            onChange={handleUploadFile}
          />

          {/* Performance Chart Preview */}
          <GlassCard className="border border-slate-800 bg-slate-900/60">
            <h3 className="text-lg font-bold text-white mb-3">Hiệu Suất Tuần Này</h3>
            <div className="grid grid-cols-7 gap-2 h-40">
              {[65, 80, 55, 90, 75, 85, 70].map((height, idx) => (
                <div key={idx} className="flex flex-col items-center justify-end group">
                  <div className="relative">
                    <div className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity glass px-2 py-1 rounded text-xs whitespace-nowrap">
                      {Math.floor(height * 5)} tasks
                    </div>
                  </div>
                  <div 
                    className="w-full bg-gradient-to-t from-purple-600 to-pink-600 rounded-t-lg transition-all hover:scale-105 cursor-pointer"
                    style={{height: `${height}%`}}
                  ></div>
                  <div className="text-xs text-gray-500 mt-2">
                    {['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][idx]}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between text-xs">
              <span className="text-gray-400">Tổng: 500 công việc</span>
              <span className="text-green-400 font-bold">+15% so với tuần trước</span>
            </div>
          </GlassCard>
        </div>
        </div>

      {/* Khung 3: Trạng thái nhóm - cùng độ cao, thanh trượt riêng */}
      <div className="w-72 shrink-0 h-full flex flex-col overflow-hidden bg-slate-900/60 border-l border-slate-800">
        <div className="flex-1 min-h-0 p-4 overflow-y-auto overflow-x-visible scrollbar-overlay">
        <h2 className="text-lg font-bold mb-5 text-white flex items-center gap-2">
          <span>👥</span> Trạng Thái Nhóm
        </h2>
        
        {/* Online Members */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-400">ĐANG ONLINE - 18</h3>
            <button onClick={() => navigate('/chat/friends')} className="text-xs text-purple-400 hover:text-pink-400 transition-colors">
              Xem tất cả
            </button>
          </div>
          <div className="space-y-2">
            {['Sarah Chen', 'Mike Ross', 'Emma Wilson', 'David Kim', 'Lisa Park', 'Tom Zhang'].map((name, idx) => (
                <div key={idx} className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 transition-all cursor-pointer group">
                <div className="relative">
                  <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${
                    ['from-purple-600 to-pink-600', 'from-blue-500 to-cyan-500', 'from-green-500 to-emerald-500'][idx % 3]
                  } flex items-center justify-center text-base`}>
                    {['👩‍💼', '👨‍💻', '👩‍🎨', '👨‍🔬', '👩‍💼', '👨‍💻'][idx]}
                  </div>
                  <StatusIndicator status="online" />
                </div>
                <div className="flex-1">
                  <div className="text-white font-medium text-sm">{name}</div>
                  <div className="text-gray-500 text-xs">Đang làm việc...</div>
                </div>
                <button onClick={(event) => {
                  event.stopPropagation();
                  handleOpenTeamChat(name);
                }} className="opacity-0 group-hover:opacity-100 transition-opacity text-lg">
                  💬
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Upcoming Events */}
        <div className="mb-8">
          <h3 className="text-sm font-semibold text-gray-400 mb-4">SỰ KIỆN SẮP TỚI</h3>
          <div className="space-y-3">
            {[
              { title: "Họp Nhóm Hàng Ngày", time: "10:00 AM", attendees: 8, color: "from-blue-500 to-cyan-500", icon: "📅" },
              { title: "Demo Khách Hàng", time: "2:30 PM", attendees: 5, color: "from-purple-600 to-pink-600", icon: "🎯" },
              { title: "Đánh Giá Thiết Kế", time: "4:00 PM", attendees: 4, color: "from-green-500 to-emerald-500", icon: "🎨" }
            ].map((event, idx) => (
              <GlassCard key={idx} hover className="p-3 relative overflow-hidden group cursor-pointer border border-slate-800 bg-slate-900/60">
                <div className={`absolute inset-0 bg-gradient-to-br ${event.color} opacity-0 group-hover:opacity-10 transition-opacity`}></div>
                <div className="relative z-10">
                  <div className="flex items-start gap-3">
                    <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${event.color} flex items-center justify-center text-base flex-shrink-0`}>
                      {event.icon}
                    </div>
                    <div className="flex-1">
                      <div className="text-white font-semibold text-sm mb-1">{event.title}</div>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-gray-400">{event.time}</span>
                        <span className="text-gray-600">•</span>
                        <span className="text-gray-400">{event.attendees} người</span>
                      </div>
                    </div>
                  </div>
                  <button onClick={() => handleJoinUpcomingEvent(event.title)} className="mt-2 w-full py-1.5 bg-[#040f2a] border border-slate-800 rounded-lg text-xs font-semibold hover:bg-slate-800/70 transition-all">
                    Tham gia
                  </button>
                </div>
              </GlassCard>
            ))}
          </div>
        </div>

        {/* Quick Stats */}
        <div className="bg-[#040f2a] border border-slate-800 rounded-xl p-3.5">
          <h3 className="text-sm font-semibold text-gray-400 mb-3">THỐNG KÊ NHANH</h3>
          <div className="space-y-3">
            {[
              { label: "Thời gian làm việc", value: "32.5h", icon: "⏱️" },
              { label: "Tỷ lệ hoàn thành", value: "94%", icon: "✅" },
              { label: "Tin nhắn đã gửi", value: "1,245", icon: "💬" }
            ].map((stat, idx) => (
              <div key={idx} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{stat.icon}</span>
                  <span className="text-sm text-gray-400">{stat.label}</span>
                </div>
                <span className="text-sm font-bold text-indigo-300">{stat.value}</span>
              </div>
            ))}
          </div>
        </div>
        </div>
      </div>
    </div>

    {/* Welcome Greeting Modal (hiển thị 1 lần sau khi đăng nhập / vào web) */}
    <Modal
      isOpen={showWelcome}
      onClose={() => setShowWelcome(false)}
      title="Xin chào"
      size="sm"
    >
      <div className="space-y-4">
        <p className="text-base font-semibold text-white">{getGreeting()}</p>
        <p className="text-sm text-gray-400">
          Chúc {displayName} có một ngày làm việc hiệu quả cùng <span className="font-semibold text-gradient">VoiceHub</span>.
        </p>
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            className="bg-[#040f2a] border border-slate-800 px-4 py-2 rounded-xl text-sm hover:bg-slate-800/70 transition-all"
            onClick={() => setShowWelcome(false)}
          >
            Đóng
          </button>
          <GradientButton
            variant="primary"
            onClick={() => setShowWelcome(false)}
            className="px-4 py-2 text-sm"
          >
            Bắt đầu làm việc
          </GradientButton>
        </div>
      </div>
    </Modal>

    {/* Stat Detail Modal */}
    <Modal
      isOpen={selectedStat !== null}
      onClose={() => setSelectedStat(null)}
      title={selectedStat?.label || "Chi Tiết"}
      size="lg"
    >
        {selectedStat && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <GlassCard className="border border-slate-800 bg-slate-900/60">
                <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${selectedStat.color} flex items-center justify-center text-3xl mb-4 mx-auto`}>
                  {selectedStat.icon}
                </div>
                <div className="text-4xl font-black text-white text-center mb-2">{selectedStat.value}</div>
                <div className="text-gray-400 text-center">{selectedStat.label}</div>
              </GlassCard>
              
              <GlassCard className="border border-slate-800 bg-slate-900/60">
                <h4 className="font-bold text-white mb-4">Thống Kê Chi Tiết</h4>
                <div className="space-y-3">
                  {Object.entries(selectedStat.drilldown).filter(([key]) => !['projects', 'nguoiDongGopNhieuNhat', 'roles', 'channels'].includes(key)).map(([key, value]) => (
                    <div key={key} className="flex items-center justify-between">
                      <span className="text-gray-400 capitalize">{key}:</span>
                      <span className="text-white font-bold">{value}</span>
                    </div>
                  ))}
                </div>
              </GlassCard>
            </div>

            {selectedStat.drilldown.projects && (
              <div>
                <h4 className="font-bold text-white mb-4">Dự Án Đang Hoạt Động</h4>
                <div className="space-y-3">
                  {selectedStat.drilldown.projects.map((project, idx) => (
                    <GlassCard key={idx} hover className="border border-slate-800 bg-slate-900/60">
                      <div className="flex items-center justify-between mb-3">
                        <h5 className="font-bold text-white">{project.name}</h5>
                        <span className="text-sm text-gray-400">Còn {project.deadline}</span>
                      </div>
                      <div className="flex items-center gap-3 mb-2">
                        <div className="flex-1">
                          <div className="w-full h-2 glass-strong rounded-full overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-purple-600 to-pink-600" style={{width: `${project.progress}%`}}></div>
                          </div>
                        </div>
                        <span className="text-sm font-bold text-white">{project.progress}%</span>
                      </div>
                      <div className="text-xs text-gray-400">👥 {project.members} thành viên</div>
                    </GlassCard>
                  ))}
                </div>
              </div>
            )}

            {selectedStat.drilldown.nguoiDongGopNhieuNhat && (
              <div>
                <h4 className="font-bold text-white mb-4">Người Đóng Góp Nhiều Nhất</h4>
                <div className="space-y-2">
                  {selectedStat.drilldown.nguoiDongGopNhieuNhat.map((user, idx) => (
                    <div key={idx} className="flex items-center gap-3 p-3 bg-[#040f2a] border border-slate-800 rounded-xl">
                      <div className="text-2xl">{user.avatar}</div>
                      <div className="flex-1">
                        <div className="font-semibold text-white">{user.name}</div>
                        <div className="text-xs text-gray-400">{user.tasks} công việc</div>
                      </div>
                      <div className="text-green-400 font-bold">#{idx + 1}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selectedStat.drilldown.roles && (
              <div>
                <h4 className="font-bold text-white mb-4">Phân Bổ Theo Vai Trò</h4>
                <div className="space-y-2">
                  {selectedStat.drilldown.roles.map((role, idx) => (
                    <div key={idx} className="flex items-center gap-3 p-3 bg-[#040f2a] border border-slate-800 rounded-xl">
                      <div className="flex-1">
                        <div className="font-semibold text-white">{role.name}</div>
                        <div className="text-xs text-gray-400">{role.online}/{role.count} online</div>
                      </div>
                      <div className="w-24 h-2 glass-strong rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-green-500 to-emerald-500" style={{width: `${(role.online / role.count) * 100}%`}}></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selectedStat.drilldown.channels && (
              <div>
                <h4 className="font-bold text-white mb-4">Kênh Hoạt Động</h4>
                <div className="space-y-2">
                  {selectedStat.drilldown.channels.map((channel, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 bg-[#040f2a] border border-slate-800 rounded-xl hover:bg-slate-800/60 cursor-pointer transition-all">
                      <div>
                        <div className="font-semibold text-white">{channel.name}</div>
                        <div className="text-xs text-gray-400">{channel.messages} tin nhắn</div>
                      </div>
                      {channel.unread > 0 && (
                        <div className="px-2 py-1 rounded-full bg-red-500 text-xs font-bold">{channel.unread}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
    </Modal>

    {/* Activity Detail Modal */}
    <Modal
        isOpen={showActivityDetail !== null}
        onClose={() => setShowActivityDetail(null)}
        title="Chi Tiết Hoạt Động"
        size="md"
      >
        {showActivityDetail && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3.5 bg-[#040f2a] border border-slate-800 rounded-xl">
              <div className={`w-14 h-14 rounded-full bg-gradient-to-br ${showActivityDetail.color} flex items-center justify-center text-2xl`}>
                {showActivityDetail.avatar}
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">{showActivityDetail.user}</h3>
                <p className="text-sm text-gray-400">{showActivityDetail.action} {showActivityDetail.item}</p>
                <p className="text-sm text-gray-500">{showActivityDetail.time}</p>
              </div>
            </div>

            <GlassCard className="border border-slate-800 bg-slate-900/60">
              <h4 className="font-bold text-white mb-3">Thông Tin</h4>
              <div className="space-y-2">
                {Object.entries(showActivityDetail.detail).map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between py-2 border-b border-white/5">
                    <span className="text-gray-400 capitalize">{key}:</span>
                    <span className="text-white font-semibold">{Array.isArray(value) ? value.join(', ') : value}</span>
                  </div>
                ))}
              </div>
            </GlassCard>

            <div className="flex gap-3">
              <GradientButton 
                variant="primary" 
                className="flex-1 text-sm"
                onClick={() => {
                  setShowActivityDetail(false);
                  handleOpenActivityTarget(showActivityDetail);
                }}
              >
                Xem Chi Tiết
              </GradientButton>
              <button 
                onClick={() => handleShareActivity(showActivityDetail)}
                className="flex-1 bg-[#040f2a] border border-slate-800 px-5 py-2.5 rounded-xl hover:bg-slate-800/70 transition-all text-sm font-semibold"
              >
                Chia Sẻ
              </button>
            </div>
          </div>
        )}
    </Modal>

    {/* New Project Modal */}
    <Modal
        isOpen={showNewProjectModal}
        onClose={() => setShowNewProjectModal(false)}
        title="Tạo Dự Án Mới"
        size="lg"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold mb-2 text-gray-300">Tên Dự Án</label>
            <input 
              type="text" 
              placeholder="Nhập tên dự án..."
              value={newProjectForm.name}
              onChange={(e) => setNewProjectForm((prev) => ({ ...prev, name: e.target.value }))}
              className="w-full px-4 py-2.5 rounded-xl bg-[#040f2a] border border-slate-800 focus:border-indigo-500 outline-none text-sm text-white"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold mb-2 text-gray-300">Mô Tả</label>
            <textarea 
              placeholder="Mô tả dự án..."
              rows="4"
              value={newProjectForm.description}
              onChange={(e) => setNewProjectForm((prev) => ({ ...prev, description: e.target.value }))}
              className="w-full px-4 py-2.5 rounded-xl bg-[#040f2a] border border-slate-800 focus:border-indigo-500 outline-none text-sm text-white"
            ></textarea>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold mb-2 text-gray-300">Ngày Bắt Đầu</label>
              <input 
                type="date"
                value={newProjectForm.startDate}
                onChange={(e) => setNewProjectForm((prev) => ({ ...prev, startDate: e.target.value }))}
                className="w-full px-4 py-2.5 rounded-xl bg-[#040f2a] border border-slate-800 focus:border-indigo-500 outline-none text-sm text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-2 text-gray-300">Deadline</label>
              <input 
                type="date"
                value={newProjectForm.deadline}
                onChange={(e) => setNewProjectForm((prev) => ({ ...prev, deadline: e.target.value }))}
                className="w-full px-4 py-2.5 rounded-xl bg-[#040f2a] border border-slate-800 focus:border-indigo-500 outline-none text-sm text-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold mb-2 text-gray-300">Thành Viên</label>
            <div className="flex flex-wrap gap-2 mb-3">
              {teamMembers.map((member, idx) => (
                <button key={idx} onClick={() => handleToggleProjectMember(member)} className={`border px-3 py-2 rounded-lg text-sm transition-all ${selectedProjectMembers.includes(member) ? 'bg-gradient-to-r from-violet-500 to-indigo-500 border-violet-400 text-white' : 'bg-[#040f2a] border-slate-800 hover:bg-slate-800/70'}`}>
                  {member}
                </button>
              ))}
            </div>
            <button onClick={() => {
              setShowNewProjectModal(false);
              setShowInviteModal(true);
            }} className="text-indigo-400 text-sm hover:text-indigo-300 transition-colors">+ Thêm thành viên</button>
          </div>

          <div className="flex gap-3 pt-4">
            <GradientButton 
              variant="primary" 
              className="flex-1 text-sm"
              onClick={handleCreateProject}
            >
              Tạo Dự Án
            </GradientButton>
            <button 
              onClick={() => setShowNewProjectModal(false)}
              className="flex-1 bg-[#040f2a] border border-slate-800 px-5 py-2.5 rounded-xl hover:bg-slate-800/70 transition-all text-sm font-semibold"
            >
              Hủy
            </button>
          </div>
        </div>
    </Modal>

    <Modal
      isOpen={showInviteModal}
      onClose={() => setShowInviteModal(false)}
      title="Mời Thành Viên"
      size="sm"
    >
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-semibold mb-2 text-gray-300">Username / Tên hiển thị / SĐT</label>
          <input
            type="text"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="vd: nguyenvana hoặc 090xxxxxxx"
            className="w-full px-4 py-2.5 rounded-xl bg-[#040f2a] border border-slate-800 focus:border-indigo-500 outline-none text-sm text-white"
          />
        </div>
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={() => setShowInviteModal(false)}
            className="px-4 py-2 rounded-lg bg-[#040f2a] border border-slate-800 text-sm text-gray-200 hover:bg-slate-800/70"
          >
            Hủy
          </button>
          <GradientButton variant="primary" className="px-4 py-2 text-sm" onClick={handleInviteMember}>
            Gửi lời mời
          </GradientButton>
        </div>
      </div>
    </Modal>

    {/* Toast Notifications */}
    {toast && (
      <Toast 
        message={toast.message} 
        type={toast.type}
        onClose={() => setToast(null)}
      />
    )}
  </>
  );
}

export default DashboardPage;
