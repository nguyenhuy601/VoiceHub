import { useState } from 'react';
import ThreeFrameLayout from '../../components/Layout/ThreeFrameLayout';
import { GlassCard, GradientButton, Modal, Toast } from '../../components/Shared';
import { taskAPI } from '../../services/api/taskAPI';

function TasksPage() {
  const [filterPriority, setFilterPriority] = useState('all');
  const [filterAssignee, setFilterAssignee] = useState('all');
  const [viewMode, setViewMode] = useState('kanban'); // kanban or list
  const [selectedTask, setSelectedTask] = useState(null);
  const [showCreateTaskModal, setShowCreateTaskModal] = useState(false);
  const [toast, setToast] = useState(null);
  const [createTaskLoading, setCreateTaskLoading] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    priority: 'medium',
    assignee: '',
    dueDate: '',
    description: ''
  });

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleCreateTask = async () => {
    // Validation
    if (!formData.title.trim()) {
      showToast('Vui lòng nhập tiêu đề công việc', 'error');
      return;
    }
    if (!formData.assignee) {
      showToast('Vui lòng chọn người phụ trách', 'error');
      return;
    }
    if (!formData.dueDate) {
      showToast('Vui lòng chọn hạn hoàn thành', 'error');
      return;
    }

    try {
      setCreateTaskLoading(true);
      const newTask = {
        title: formData.title.trim(),
        priority: formData.priority,
        assignee: formData.assignee,
        dueDate: formData.dueDate,
        description: formData.description.trim(),
        tags: [],
        subtasks: [],
        progress: 0,
        comments: 0,
        attachments: 0
      };

      await taskAPI.createTask(newTask);
      showToast('Tạo công việc thành công!', 'success');
      setShowCreateTaskModal(false);
      setFormData({ title: '', priority: 'medium', assignee: '', dueDate: '', description: '' });
    } catch (error) {
      console.error('Lỗi tạo công việc:', error);
      showToast(error.response?.data?.message || 'Lỗi tạo công việc', 'error');
    } finally {
      setCreateTaskLoading(false);
    }
  };

  const tasks = {
    todo: [
      { 
        id: 1, 
        title: 'Thiết kế Landing Page mới', 
        priority: 'high', 
        assignee: { name: 'Sarah Chen', avatar: '👩‍🎨' },
        dueDate: 'Hôm nay',
        tags: ['Thiết Kế', 'Giao Diện'],
        progress: 0,
        subtasks: [
          { id: 's1', title: 'Khung dây', done: false },
          { id: 's2', title: 'Mẫu thiết kế', done: false },
          { id: 's3', title: 'Nguyên mẫu', done: false }
        ],
        comments: 2,
        attachments: 1
      },
      { 
        id: 2, 
        title: 'Đánh Giá Pull Requests #234-238', 
        priority: 'medium', 
        assignee: { name: 'Mike Ross', avatar: '👨‍💻' },
        dueDate: 'Ngày mai',
        tags: ['Đánh Giá Code', 'Backend'],
        progress: 25,
        subtasks: [
          { id: 's4', title: 'PR #234', done: true },
          { id: 's5', title: 'PR #235', done: false },
          { id: 's6', title: 'PR #236', done: false },
          { id: 's7', title: 'PR #238', done: false }
        ],
        comments: 5,
        attachments: 0
      },
      { 
        id: 3, 
        title: 'Cập nhật Tài Liệu API', 
        priority: 'low', 
        assignee: { name: 'Emma Wilson', avatar: '👩‍🎨' },
        dueDate: 'Tuần này',
        tags: ['Tài Liệu'],
        progress: 0,
        subtasks: [],
        comments: 1,
        attachments: 2
      }
    ],
    inProgress: [
      { 
        id: 4, 
        title: 'Triển Khai Xác Thực với JWT', 
        priority: 'high', 
        assignee: { name: 'David Kim', avatar: '👨‍🔬' },
        dueDate: 'Hôm nay',
        tags: ['Backend', 'Bảo Mật'],
        progress: 60,
        subtasks: [
          { id: 's8', title: 'Thiết lập JWT', done: true },
          { id: 's9', title: 'Token làm mới', done: true },
          { id: 's10', title: 'Kiểm thử', done: false }
        ],
        comments: 8,
        attachments: 3
      },
      { 
        id: 5, 
        title: 'Tối ưu Hiệu Năng Cơ Sở Dữ Liệu', 
        priority: 'medium', 
        assignee: { name: 'Lisa Park', avatar: '👩‍💼' },
        dueDate: '2 ngày nữa',
        tags: ['Cơ Sở Dữ Liệu', 'Hiệu Năng'],
        progress: 40,
        subtasks: [
          { id: 's11', title: 'Đánh chỉ mục', done: true },
          { id: 's12', title: 'Tối ưu truy vấn', done: false }
        ],
        comments: 3,
        attachments: 1
      }
    ],
    done: [
      { 
        id: 6, 
        title: 'Thiết Lập Quy Trình Tự Động CI/CD', 
        priority: 'high', 
        assignee: { name: 'Mike Ross', avatar: '👨‍💻' },
        dueDate: 'Hôm qua',
        tags: ['DevOps', 'Tự Động Hóa'],
        progress: 100,
        subtasks: [
          { id: 's13', title: 'Thiết lập quy trình', done: true },
          { id: 's14', title: 'Kiểm thử triển khai', done: true },
          { id: 's15', title: 'Triển khai sản xuất', done: true }
        ],
        comments: 12,
        attachments: 4,
        completedAt: '17/01/2026'
      },
      { 
        id: 7, 
        title: 'Viết Kiểm Thử Đơn Vị cho Dịch Vụ Người Dùng', 
        priority: 'medium', 
        assignee: { name: 'Sarah Chen', avatar: '👩‍🎨' },
        dueDate: '2 ngày trước',
        tags: ['Kiểm Thử', 'Backend'],
        progress: 100,
        subtasks: [
          { id: 's16', title: 'Kiểm thử xác thực', done: true },
          { id: 's17', title: 'Kiểm thử CRUD', done: true }
        ],
        comments: 6,
        attachments: 2,
        completedAt: '16/01/2026'
      }
    ]
  };

  const getPriorityColor = (priority) => {
    const colors = {
      high: 'from-red-500 to-orange-500',
      medium: 'from-yellow-500 to-orange-500',
      low: 'from-green-500 to-emerald-500'
    };
    return colors[priority] || colors.medium;
  };

  const getPriorityLabel = (priority) => {
    const labels = {
      high: 'Cao',
      medium: 'Trung Bình',
      low: 'Thấp'
    };
    return labels[priority] || priority;
  };

  const allTasks = [...tasks.todo, ...tasks.inProgress, ...tasks.done];
  const totalTasks = allTasks.length;
  const completedTasks = tasks.done.length;
  const completionRate = Math.round((completedTasks / totalTasks) * 100);

  return (
    <ThreeFrameLayout
      center={
        <div className="flex flex-col h-full">
        {/* Header */}
        <div className="p-6 glass-strong border-b border-white/10">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-4xl font-black text-gradient mb-2">Bảng Công Việc</h1>
              <p className="text-gray-400">Quản lý công việc nhóm hiệu quả</p>
            </div>
            <div className="flex gap-3">
              <button 
                onClick={() => setViewMode(viewMode === 'kanban' ? 'list' : 'kanban')}
                className="glass px-4 py-2 rounded-xl hover:bg-white/10 transition-all flex items-center gap-2 font-semibold"
              >
                <span>{viewMode === 'kanban' ? '📋' : '📊'}</span>
                {viewMode === 'kanban' ? 'Danh sách' : 'Kanban'}
              </button>
              <GradientButton 
                variant="primary"
                onClick={() => setShowCreateTaskModal(true)}
              >
                <span className="text-xl mr-2">➕</span> Công Việc Mới
              </GradientButton>
            </div>
          </div>

          {/* Stats & Filters */}
          <div className="flex items-center justify-between">
            {/* Quick Stats */}
            <div className="flex gap-6">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center text-xl">
                  📊
                </div>
                <div>
                  <div className="text-sm text-gray-400">Tổng</div>
                  <div className="text-lg font-bold text-white">{totalTasks}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-xl">
                  ⏳
                </div>
                <div>
                  <div className="text-sm text-gray-400">Đang làm</div>
                  <div className="text-lg font-bold text-white">{tasks.inProgress.length}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center text-xl">
                  ✅
                </div>
                <div>
                  <div className="text-sm text-gray-400">Hoàn thành</div>
                  <div className="text-lg font-bold text-gradient">{completedTasks} ({completionRate}%)</div>
                </div>
              </div>
            </div>

            {/* Filters */}
            <div className="flex gap-2">
              <select 
                value={filterPriority}
                onChange={(e) => setFilterPriority(e.target.value)}
                className="px-4 py-2 rounded-xl glass border border-white/20 focus:border-purple-500 outline-none text-white text-sm"
              >
                <option value="all">Tất cả ưu tiên</option>
                <option value="high">🔴 Cao</option>
                <option value="medium">🟡 Trung bình</option>
                <option value="low">🟢 Thấp</option>
              </select>
              <select 
                value={filterAssignee}
                onChange={(e) => setFilterAssignee(e.target.value)}
                className="px-4 py-2 rounded-xl glass border border-white/20 focus:border-purple-500 outline-none text-white text-sm"
              >
                <option value="all">Tất cả người làm</option>
                <option value="sarah">👩‍🎨 Sarah Chen</option>
                <option value="mike">👨‍💻 Mike Ross</option>
                <option value="emma">👩‍🎨 Emma Wilson</option>
                <option value="david">👨‍🔬 David Kim</option>
              </select>
            </div>
          </div>
        </div>

        {/* Kanban Board or List View */}
        <div className="flex-1 p-6">
          {viewMode === 'kanban' ? (
          // KANBAN VIEW
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-full">
            {/* Cần Làm Column */}
            <div className="flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-gradient-to-r from-purple-600 to-pink-600"></div>
                  <h2 className="text-xl font-bold text-white">Cần Làm</h2>
                  <span className="px-2 py-0.5 rounded-full glass text-sm font-bold">{tasks.todo.length}</span>
                </div>
                <button className="text-gray-400 hover:text-white transition-colors">⋯</button>
              </div>
              
              <div className="space-y-3 flex-1">
                {tasks.todo.map(task => (
                  <GlassCard 
                    key={task.id} 
                    hover 
                    className="cursor-pointer group animate-slideUp"
                    onClick={() => setSelectedTask(task)}
                  >
                    {/* Priority Bar */}
                    <div className={`w-full h-1 rounded-full bg-gradient-to-r ${getPriorityColor(task.priority)} mb-3`}></div>
                    
                    {/* Title */}
                    <h3 className="font-bold text-white mb-3 group-hover:text-gradient transition-colors">{task.title}</h3>
                    
                    {/* Tags */}
                    {task.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-3">
                        {task.tags.map((tag, idx) => (
                          <span key={idx} className="px-2 py-0.5 rounded-full glass text-xs text-gray-300">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Progress Bar */}
                    {task.subtasks.length > 0 && (
                      <div className="mb-3">
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-gray-400">Tiến độ</span>
                          <span className="text-gray-300">{task.subtasks.filter(st => st.done).length}/{task.subtasks.length}</span>
                        </div>
                        <div className="w-full h-1.5 glass-strong rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-gradient-to-r from-purple-600 to-pink-600 transition-all"
                            style={{width: `${(task.subtasks.filter(st => st.done).length / task.subtasks.length) * 100}%`}}
                          ></div>
                        </div>
                      </div>
                    )}

                    {/* Footer */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1">
                          <span className="text-2xl" title={task.assignee.name}>{task.assignee.avatar}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-gray-400">
                          {task.comments > 0 && (
                            <span className="flex items-center gap-1">
                              💬 {task.comments}
                            </span>
                          )}
                          {task.attachments > 0 && (
                            <span className="flex items-center gap-1">
                              📎 {task.attachments}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-1 rounded-lg text-xs font-bold bg-gradient-to-r ${getPriorityColor(task.priority)} text-white`}>
                          {getPriorityLabel(task.priority)}
                        </span>
                      </div>
                    </div>

                    {/* Due Date */}
                    <div className="mt-2 flex items-center gap-1 text-xs text-gray-500">
                      <span>📅</span>
                      <span>{task.dueDate}</span>
                    </div>
                  </GlassCard>
                ))}
                <button className="w-full py-3 glass rounded-xl hover:bg-white/10 transition-all text-gray-400 hover:text-white flex items-center justify-center gap-2">
                  <span>➕</span> Thêm công việc
                </button>
              </div>
            </div>

            {/* Đang Thực Hiện Column */}
            <div className="flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-gradient-to-r from-blue-500 to-cyan-500 animate-pulse"></div>
                  <h2 className="text-xl font-bold text-white">Đang Thực Hiện</h2>
                  <span className="px-2 py-0.5 rounded-full glass text-sm font-bold">{tasks.inProgress.length}</span>
                </div>
                <button className="text-gray-400 hover:text-white transition-colors">⋯</button>
              </div>
              
              <div className="space-y-3 flex-1">
                {tasks.inProgress.map(task => (
                  <GlassCard 
                    key={task.id} 
                    hover 
                    glow
                    className="cursor-pointer group animate-slideUp relative overflow-hidden"
                    onClick={() => setSelectedTask(task)}
                  >
                    {/* Animated border for active tasks */}
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-cyan-500 opacity-0 group-hover:opacity-10 transition-opacity"></div>
                    
                    <div className="relative z-10">
                      <div className={`w-full h-1 rounded-full bg-gradient-to-r ${getPriorityColor(task.priority)} mb-3`}></div>
                      
                      <h3 className="font-bold text-white mb-3 group-hover:text-gradient transition-colors">{task.title}</h3>
                      
                      {task.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-3">
                          {task.tags.map((tag, idx) => (
                            <span key={idx} className="px-2 py-0.5 rounded-full glass text-xs text-gray-300">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Enhanced Progress Bar */}
                      {task.subtasks.length > 0 && (
                        <div className="mb-3">
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="text-gray-400">Tiến độ</span>
                            <span className="text-blue-400 font-bold">{task.progress}%</span>
                          </div>
                          <div className="w-full h-2 glass-strong rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-gradient-to-r from-blue-500 to-cyan-500 transition-all relative overflow-hidden"
                              style={{width: `${task.progress}%`}}
                            >
                              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer"></div>
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl" title={task.assignee.name}>{task.assignee.avatar}</span>
                          <div className="flex items-center gap-2 text-xs text-gray-400">
                            {task.comments > 0 && <span className="flex items-center gap-1">💬 {task.comments}</span>}
                            {task.attachments > 0 && <span className="flex items-center gap-1">📎 {task.attachments}</span>}
                          </div>
                        </div>
                        <span className={`px-2 py-1 rounded-lg text-xs font-bold bg-gradient-to-r ${getPriorityColor(task.priority)} text-white`}>
                          {getPriorityLabel(task.priority)}
                        </span>
                      </div>

                      <div className="mt-2 flex items-center gap-1 text-xs text-gray-500">
                        <span>📅</span>
                        <span>{task.dueDate}</span>
                      </div>
                    </div>
                  </GlassCard>
                ))}
                <button className="w-full py-3 glass rounded-xl hover:bg-white/10 transition-all text-gray-400 hover:text-white flex items-center justify-center gap-2">
                  <span>➕</span> Thêm công việc
                </button>
              </div>
            </div>

            {/* Hoàn Thành Column */}
            <div className="flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-gradient-to-r from-green-500 to-emerald-500"></div>
                  <h2 className="text-xl font-bold text-white">Hoàn Thành</h2>
                  <span className="px-2 py-0.5 rounded-full glass text-sm font-bold">{tasks.done.length}</span>
                </div>
                <button className="text-gray-400 hover:text-white transition-colors">⋯</button>
              </div>
              
              <div className="space-y-3 flex-1">
                {tasks.done.map(task => (
                  <GlassCard 
                    key={task.id} 
                    hover 
                    className="cursor-pointer group animate-slideUp opacity-75 hover:opacity-100 transition-opacity"
                    onClick={() => setSelectedTask(task)}
                  >
                    <div className="w-full h-1 rounded-full bg-gradient-to-r from-green-500 to-emerald-500 mb-3"></div>
                    
                    <div className="flex items-start gap-2 mb-3">
                      <span className="text-green-400 text-xl mt-0.5">✓</span>
                      <h3 className="font-bold text-white line-through flex-1">{task.title}</h3>
                    </div>
                    
                    {task.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-3">
                        {task.tags.map((tag, idx) => (
                          <span key={idx} className="px-2 py-0.5 rounded-full glass text-xs text-gray-400">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl opacity-50" title={task.assignee.name}>{task.assignee.avatar}</span>
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          {task.comments > 0 && <span>💬 {task.comments}</span>}
                          {task.attachments > 0 && <span>📎 {task.attachments}</span>}
                        </div>
                      </div>
                      <span className="px-2 py-1 rounded-lg text-xs font-bold bg-gradient-to-r from-green-500 to-emerald-500 text-white opacity-50">
                        {getPriorityLabel(task.priority)}
                      </span>
                    </div>

                    <div className="text-xs text-gray-600 flex items-center gap-1">
                      <span>🎉</span>
                      <span>Hoàn thành: {task.completedAt}</span>
                    </div>
                  </GlassCard>
                ))}
              </div>
            </div>
          </div>
          ) : (
          // LIST VIEW
          <div className="space-y-3">
            <GlassCard className="mb-4">
              <div className="grid grid-cols-12 gap-4 text-sm font-bold text-gray-400 px-2">
                <div className="col-span-4">Tiêu đề</div>
                <div className="col-span-2">Người làm</div>
                <div className="col-span-2">Trạng thái</div>
                <div className="col-span-2">Ưu tiên</div>
                <div className="col-span-2">Hạn</div>
              </div>
            </GlassCard>
            
            {/* Combine all tasks for list view */}
            {[
              ...tasks.todo.map(t => ({...t, status: 'todo', statusLabel: 'Cần làm', statusColor: 'from-purple-600 to-pink-600'})),
              ...tasks.inProgress.map(t => ({...t, status: 'inProgress', statusLabel: 'Đang làm', statusColor: 'from-blue-500 to-cyan-500'})),
              ...tasks.done.map(t => ({...t, status: 'done', statusLabel: 'Hoàn thành', statusColor: 'from-green-500 to-emerald-500'}))
            ].map(task => (
              <GlassCard 
                key={task.id} 
                hover
                className="cursor-pointer group"
                onClick={() => setSelectedTask(task)}
              >
                <div className="grid grid-cols-12 gap-4 items-center">
                  <div className="col-span-4">
                    <div className={`w-full h-1 rounded-full bg-gradient-to-r ${getPriorityColor(task.priority)} mb-2`}></div>
                    <h3 className={`font-bold text-white group-hover:text-gradient transition-colors ${task.status === 'done' ? 'line-through opacity-75' : ''}`}>
                      {task.title}
                    </h3>
                    {task.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {task.tags.map((tag, idx) => (
                          <span key={idx} className="px-2 py-0.5 rounded-full glass text-xs text-gray-400">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  
                  <div className="col-span-2 flex items-center gap-2">
                    <span className="text-2xl">{task.assignee.avatar}</span>
                    <span className="text-sm text-gray-300">{task.assignee.name.split(' ')[0]}</span>
                  </div>
                  
                  <div className="col-span-2">
                    <span className={`px-3 py-1 rounded-lg text-xs font-bold bg-gradient-to-r ${task.statusColor} text-white inline-block`}>
                      {task.statusLabel}
                    </span>
                  </div>
                  
                  <div className="col-span-2">
                    <span className={`px-2 py-1 rounded-lg text-xs font-bold bg-gradient-to-r ${getPriorityColor(task.priority)} text-white inline-block`}>
                      {getPriorityLabel(task.priority)}
                    </span>
                  </div>
                  
                  <div className="col-span-2 text-sm text-gray-400">
                    📅 {task.dueDate}
                  </div>
                </div>
                
                {/* Progress bar for list view */}
                {task.subtasks && task.subtasks.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-white/10">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-gray-400">Tiến độ</span>
                      <span className="text-gray-300">{task.subtasks.filter(st => st.done).length}/{task.subtasks.length}</span>
                    </div>
                    <div className="w-full h-1.5 glass-strong rounded-full overflow-hidden">
                      <div 
                        className={`h-full bg-gradient-to-r ${task.statusColor} transition-all`}
                        style={{width: `${(task.subtasks.filter(st => st.done).length / task.subtasks.length) * 100}%`}}
                      ></div>
                    </div>
                  </div>
                )}
              </GlassCard>
            ))}
          </div>
          )}
        </div>

        {/* Task Detail Modal */}
        <Modal
          isOpen={selectedTask !== null}
          onClose={() => setSelectedTask(null)}
          title={selectedTask?.title || "Chi Tiết Công Việc"}
          size="lg"
        >
          {selectedTask && (
            <div className="space-y-6">
              {/* Task Header */}
              <div className="flex items-start gap-4">
                <div className={`w-16 h-16 rounded-xl bg-gradient-to-br ${getPriorityColor(selectedTask.priority)} flex items-center justify-center text-3xl shadow-lg`}>
                  ✅
                </div>
                <div className="flex-1">
                  <input
                    type="text"
                    defaultValue={selectedTask.title}
                    className="text-2xl font-bold text-white bg-transparent border-b-2 border-transparent hover:border-purple-500 focus:border-purple-500 outline-none w-full transition-all mb-2"
                  />
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className={`px-3 py-1 rounded-lg text-xs font-bold bg-gradient-to-r ${getPriorityColor(selectedTask.priority)} text-white`}>
                      {getPriorityLabel(selectedTask.priority)}
                    </span>
                    <span className="flex items-center gap-1 text-sm text-gray-400">
                      📅 {selectedTask.dueDate}
                    </span>
                    {selectedTask.completedAt && (
                      <span className="flex items-center gap-1 text-sm text-green-400">
                        ✓ Hoàn thành {selectedTask.completedAt}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Assignee & Tags */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <GlassCard>
                  <h4 className="font-semibold text-white mb-3 flex items-center gap-2">
                    <span>👤</span> Người Phụ Trách
                  </h4>
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center text-2xl">
                      {selectedTask.assignee.avatar}
                    </div>
                    <div>
                      <div className="font-semibold text-white">{selectedTask.assignee.name}</div>
                      <div className="text-xs text-gray-400">Developer</div>
                    </div>
                  </div>
                </GlassCard>

                <GlassCard>
                  <h4 className="font-semibold text-white mb-3 flex items-center gap-2">
                    <span>🏷️</span> Tags
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {selectedTask.tags.map((tag, idx) => (
                      <span key={idx} className="px-3 py-1 rounded-full glass text-sm text-white hover:bg-white/20 cursor-pointer transition-all">
                        {tag}
                      </span>
                    ))}
                    <button className="px-3 py-1 rounded-full glass text-sm text-gray-400 hover:text-white transition-all">
                      + Thêm
                    </button>
                  </div>
                </GlassCard>
              </div>

              {/* Progress & Subtasks */}
              {selectedTask.subtasks && selectedTask.subtasks.length > 0 && (
                <GlassCard>
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="font-semibold text-white flex items-center gap-2">
                      <span>☑️</span> Checklist ({selectedTask.subtasks.filter(st => st.done).length}/{selectedTask.subtasks.length})
                    </h4>
                    <span className="text-sm font-bold text-purple-400">{Math.round((selectedTask.subtasks.filter(st => st.done).length / selectedTask.subtasks.length) * 100)}%</span>
                  </div>
                  <div className="w-full h-2 glass-strong rounded-full overflow-hidden mb-4">
                    <div 
                      className="h-full bg-gradient-to-r from-purple-600 to-pink-600 transition-all"
                      style={{width: `${(selectedTask.subtasks.filter(st => st.done).length / selectedTask.subtasks.length) * 100}%`}}
                    ></div>
                  </div>
                  <div className="space-y-2">
                    {selectedTask.subtasks.map((subtask) => (
                      <label key={subtask.id} className="flex items-center gap-3 p-3 glass-strong rounded-lg hover:bg-white/5 cursor-pointer transition-all">
                        <input 
                          type="checkbox" 
                          defaultChecked={subtask.done}
                          className="w-5 h-5 rounded"
                        />
                        <span className={`flex-1 ${subtask.done ? 'line-through text-gray-500' : 'text-white'}`}>
                          {subtask.title}
                        </span>
                      </label>
                    ))}
                  </div>
                  <button className="w-full mt-3 py-2 glass rounded-lg hover:bg-white/10 transition-all text-sm text-gray-400 hover:text-white">
                    + Thêm item
                  </button>
                </GlassCard>
              )}

              {/* Description */}
              <GlassCard>
                <h4 className="font-semibold text-white mb-3 flex items-center gap-2">
                  <span>📝</span> Mô Tả
                </h4>
                <textarea
                  placeholder="Thêm mô tả chi tiết..."
                  rows="4"
                  className="w-full px-4 py-3 rounded-xl glass border border-white/20 focus:border-purple-500 outline-none text-white resize-none"
                ></textarea>
              </GlassCard>

              {/* Comments */}
              <GlassCard>
                <h4 className="font-semibold text-white mb-4 flex items-center gap-2">
                  <span>💬</span> Comments ({selectedTask.comments})
                </h4>
                <div className="space-y-3 mb-4">
                  {Array(Math.min(selectedTask.comments, 3)).fill(0).map((_, idx) => (
                    <div key={idx} className="flex gap-3 p-3 glass-strong rounded-lg">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-xl flex-shrink-0">
                        {['👩‍💼', '👨‍💻', '👩‍🎨'][idx]}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-white text-sm">{['Sarah', 'Mike', 'Emma'][idx]}</span>
                          <span className="text-xs text-gray-500">{['5 phút', '1 giờ', '2 giờ'][idx]} trước</span>
                        </div>
                        <p className="text-sm text-gray-300">
                          {['Tuyệt vời! Cần hỗ trợ gì không?', 'Mình đã xem qua rồi, looks good!', 'Có thể merge được rồi 👍'][idx]}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Viết comment..."
                    className="flex-1 px-4 py-2 rounded-xl glass border border-white/20 focus:border-purple-500 outline-none text-white text-sm"
                  />
                  <button className="px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 transition-all text-white font-semibold">
                    Gửi
                  </button>
                </div>
              </GlassCard>

              {/* Attachments */}
              {selectedTask.attachments > 0 && (
                <GlassCard>
                  <h4 className="font-semibold text-white mb-4 flex items-center gap-2">
                    <span>📎</span> Tệp Đính Kèm ({selectedTask.attachments})
                  </h4>
                  <div className="space-y-2">
                    {Array(selectedTask.attachments).fill(0).map((_, idx) => (
                      <div key={idx} className="flex items-center gap-3 p-3 glass-strong rounded-lg hover:bg-white/5 cursor-pointer transition-all">
                        <span className="text-3xl">{['📄', '🖼️', '📊'][idx % 3]}</span>
                        <div className="flex-1">
                          <div className="text-sm font-semibold text-white">{['Design_Specs.pdf', 'Screenshot.png', 'Report.xlsx'][idx % 3]}</div>
                          <div className="text-xs text-gray-400">{['2.4 MB', '1.8 MB', '856 KB'][idx % 3]}</div>
                        </div>
                        <button className="text-purple-400 text-sm hover:text-pink-400 transition-colors">Tải về</button>
                      </div>
                    ))}
                  </div>
                  <button className="w-full mt-3 py-2 glass rounded-lg hover:bg-white/10 transition-all text-sm text-gray-400 hover:text-white flex items-center justify-center gap-2">
                    <span>📎</span> Đính kèm tệp
                  </button>
                </GlassCard>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3 pt-4 border-t border-white/10">
                <GradientButton variant="success" className="flex-1">
                  ✓ Hoàn Thành
                </GradientButton>
                <button className="flex-1 glass px-6 py-3 rounded-xl hover:bg-white/10 transition-all font-semibold">
                  Lưu Thay Đổi
                </button>
                <button className="glass px-4 py-3 rounded-xl hover:bg-white/10 transition-all text-red-400">
                  🗑️
                </button>
              </div>
            </div>
          )}
        </Modal>

        {/* Create Task Modal */}
        <Modal 
          isOpen={showCreateTaskModal} 
          onClose={() => setShowCreateTaskModal(false)}
          title="Tạo Công Việc Mới"
          size="lg"
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-400 mb-2">Tiêu đề công việc <span className="text-red-400">*</span></label>
              <input 
                type="text"
                placeholder="Nhập tiêu đề..."
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                disabled={createTaskLoading}
                className="w-full glass px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-purple-500/50 focus:outline-none text-white placeholder-gray-500 transition-all disabled:opacity-50"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-400 mb-2">Ưu tiên</label>
                <select 
                  value={formData.priority}
                  onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                  disabled={createTaskLoading}
                  className="w-full glass px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white disabled:opacity-50"
                >
                  <option value="high">🔴 Cao</option>
                  <option value="medium">🟡 Trung bình</option>
                  <option value="low">🟢 Thấp</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-400 mb-2">Người làm <span className="text-red-400">*</span></label>
                <select 
                  value={formData.assignee}
                  onChange={(e) => setFormData({ ...formData, assignee: e.target.value })}
                  disabled={createTaskLoading}
                  className="w-full glass px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white disabled:opacity-50"
                >
                  <option value="">-- Chọn người --</option>
                  <option value="sarah">👩‍🎨 Sarah Chen</option>
                  <option value="mike">👨‍💻 Mike Ross</option>
                  <option value="emma">👩‍🎨 Emma Wilson</option>
                  <option value="david">👨‍🔬 David Kim</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-400 mb-2">Hạn hoàn thành <span className="text-red-400">*</span></label>
              <input 
                type="date"
                value={formData.dueDate}
                onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                disabled={createTaskLoading}
                className="w-full glass px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-purple-500/50 focus:outline-none text-white transition-all disabled:opacity-50"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-400 mb-2">Mô tả</label>
              <textarea 
                rows={4}
                placeholder="Mô tả chi tiết công việc..."
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                disabled={createTaskLoading}
                className="w-full glass px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-purple-500/50 focus:outline-none text-white placeholder-gray-500 transition-all resize-none disabled:opacity-50"
              ></textarea>
            </div>

            <div className="flex gap-3">
              <GradientButton 
                variant="primary" 
                onClick={handleCreateTask}
                disabled={createTaskLoading}
                className="flex-1 disabled:opacity-50"
              >
                {createTaskLoading ? '⏳ Đang tạo...' : '✅ Tạo Công Việc'}
              </GradientButton>
              <button 
                onClick={() => {
                  setShowCreateTaskModal(false);
                  setFormData({ title: '', priority: 'medium', assignee: '', dueDate: '', description: '' });
                }}
                disabled={createTaskLoading}
                className="glass px-6 py-3 rounded-xl hover:bg-white/10 transition-all font-semibold disabled:opacity-50"
              >
                Hủy
              </button>
            </div>
          </div>
        </Modal>

        {/* Toast */}
        {toast && (
          <Toast 
            message={toast.message} 
            type={toast.type}
            onClose={() => setToast(null)}
          />
        )}
      </div>
      }
    />
  );
}

export default TasksPage;
