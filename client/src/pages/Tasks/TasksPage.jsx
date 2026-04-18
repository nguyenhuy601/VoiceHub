import { useState, useEffect, useMemo, useCallback } from 'react';
import ThreeFrameLayout from '../../components/Layout/ThreeFrameLayout';
import { GlassCard, GradientButton, Modal, Toast } from '../../components/Shared';
import TasksKanbanDnd, {
  COL_TODO,
  COL_PROGRESS,
  COL_DONE,
} from '../../components/Tasks/TasksKanbanDnd';
import { taskAPI } from '../../services/api/taskAPI';
import { organizationAPI } from '../../services/api/organizationAPI';
import apiClient from '../../services/api/apiClient';

const PROOF_MAX_BYTES = 5 * 1024 * 1024;

function taskHasProof(task) {
  return Array.isArray(task?.attachments) && task.attachments.some((a) => a && (a.url || a.name));
}

function initialsFromName(name) {
  if (!name || typeof name !== 'string') return '?';
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (p.length >= 2) return `${p[0][0]}${p[p.length - 1][0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function formatDueDate(value) {
  if (value == null) return 'Không hạn';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function columnForStatus(status) {
  if (status === 'done') return 'done';
  if (status === 'in_progress' || status === 'review') return 'inProgress';
  return 'todo';
}

function parseTaskListResponse(res) {
  const payload = res?.data != null && !Array.isArray(res) ? res.data : res;
  const inner = payload?.data !== undefined ? payload.data : payload;
  if (inner && Array.isArray(inner.tasks)) return inner.tasks;
  if (Array.isArray(inner)) return inner;
  return [];
}

function parseOrgList(res) {
  if (!res) return [];
  if (Array.isArray(res.data)) return res.data;
  if (Array.isArray(res)) return res;
  if (Array.isArray(res?.data?.data)) return res.data.data;
  return [];
}

function parseMembers(res) {
  const raw = res?.data ?? res;
  const arr = raw?.data ?? raw;
  return Array.isArray(arr) ? arr : [];
}

function getPriorityColor(priority) {
  const colors = {
    urgent: 'from-rose-600 to-red-600',
    high: 'from-red-500 to-orange-500',
    medium: 'from-yellow-500 to-orange-500',
    low: 'from-green-500 to-emerald-500',
  };
  return colors[priority] || colors.medium;
}

function getPriorityLabel(priority) {
  const labels = {
    urgent: 'Khẩn cấp',
    high: 'Cao',
    medium: 'Trung bình',
    low: 'Thấp',
  };
  return labels[priority] || priority;
}

function statusLabelVi(status) {
  const m = {
    todo: 'Cần làm',
    in_progress: 'Đang làm',
    review: 'Đang review',
    done: 'Hoàn thành',
    cancelled: 'Đã hủy',
  };
  return m[status] || status;
}

export default function TasksPage() {
  const [organizations, setOrganizations] = useState([]);
  const [selectedOrgId, setSelectedOrgId] = useState('');
  const [userNameMap, setUserNameMap] = useState({});
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [filterPriority, setFilterPriority] = useState('all');
  const [filterAssignee, setFilterAssignee] = useState('all');
  const [viewMode, setViewMode] = useState('kanban');
  const [selectedTask, setSelectedTask] = useState(null);

  const [detailTitle, setDetailTitle] = useState('');
  const [detailDescription, setDetailDescription] = useState('');
  const [detailPriority, setDetailPriority] = useState('medium');
  const [detailSaving, setDetailSaving] = useState(false);

  const [showCreateTaskModal, setShowCreateTaskModal] = useState(false);
  const [createTaskLoading, setCreateTaskLoading] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    priority: 'medium',
    assigneeId: '',
    dueDate: '',
    description: '',
  });

  /** Kéo sang Hoàn thành hoặc bấm Hoàn thành khi chưa có đính kèm */
  const [proofModal, setProofModal] = useState({ open: false, task: null });
  const [proofFiles, setProofFiles] = useState([]);
  const [proofSubmitting, setProofSubmitting] = useState(false);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const loadOrganizations = useCallback(async () => {
    try {
      const res = await organizationAPI.getOrganizations();
      const list = parseOrgList(res);
      setOrganizations(list);
      setSelectedOrgId((prev) => {
        if (prev) return prev;
        if (list.length) return String(list[0]._id || list[0].id || '');
        return '';
      });
    } catch (e) {
      console.error(e);
      setLoadError('Không tải được danh sách tổ chức.');
    }
  }, []);

  const resolveUserNames = useCallback(async (memberRows) => {
    const ids = [
      ...new Set(
        memberRows
          .map((m) => String(m.user || m.userId || '').trim())
          .filter(Boolean)
      ),
    ];
    const next = {};
    await Promise.all(
      ids.map(async (uid) => {
        try {
          const u = await apiClient.get(`/users/${uid}`);
          const profile = u?.data ?? u;
          const p = profile?.data ?? profile;
          next[uid] =
            p?.displayName || p?.fullName || p?.username || p?.name || `Thành viên …${uid.slice(-6)}`;
        } catch {
          next[uid] = `Thành viên …${uid.slice(-6)}`;
        }
      })
    );
    setUserNameMap((prev) => ({ ...prev, ...next }));
  }, []);

  const loadMembers = useCallback(
    async (orgId) => {
      if (!orgId) return;
      try {
        const res = await organizationAPI.getMembers(orgId);
        const members = parseMembers(res);
        await resolveUserNames(members);
      } catch (e) {
        console.error(e);
      }
    },
    [resolveUserNames]
  );

  const fetchTasks = useCallback(async () => {
    if (!selectedOrgId) {
      setTasks([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError('');
    try {
      const res = await taskAPI.getTasks({ organizationId: selectedOrgId, limit: 200 });
      setTasks(parseTaskListResponse(res));
    } catch (e) {
      console.error(e);
      setLoadError(e?.response?.data?.message || e?.message || 'Không tải được danh sách task.');
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, [selectedOrgId]);

  useEffect(() => {
    loadOrganizations();
  }, [loadOrganizations]);

  useEffect(() => {
    if (selectedOrgId) loadMembers(selectedOrgId);
  }, [selectedOrgId, loadMembers]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  useEffect(() => {
    if (!selectedTask) return;
    setDetailTitle(selectedTask.title || '');
    setDetailDescription(selectedTask.description || '');
    setDetailPriority(selectedTask.priority || 'medium');
  }, [selectedTask]);

  const assigneeName = useCallback(
    (task) => {
      const id = task?.assigneeId ? String(task.assigneeId) : '';
      if (!id) return 'Chưa gán';
      return userNameMap[id] || `…${id.slice(-6)}`;
    },
    [userNameMap]
  );

  /** Gateway đọc organizationId từ query — bắt buộc khi middleware cần ngữ cảnh org */
  const taskApiOpts = useMemo(
    () => (selectedOrgId ? { organizationId: selectedOrgId } : {}),
    [selectedOrgId]
  );

  const filteredTasks = useMemo(() => {
    let list = tasks;
    if (filterPriority !== 'all') {
      list = list.filter((t) => t.priority === filterPriority);
    }
    if (filterAssignee === 'unassigned') {
      list = list.filter((t) => !t.assigneeId);
    } else if (filterAssignee !== 'all') {
      list = list.filter((t) => String(t.assigneeId || '') === filterAssignee);
    }
    return list;
  }, [tasks, filterPriority, filterAssignee]);

  const columns = useMemo(() => {
    const todo = [];
    const inProgress = [];
    const done = [];
    for (const t of filteredTasks) {
      const col = columnForStatus(t.status);
      if (col === 'done') done.push(t);
      else if (col === 'inProgress') inProgress.push(t);
      else todo.push(t);
    }
    return { todo, inProgress, done };
  }, [filteredTasks]);

  const totalTasks = filteredTasks.length;
  const completedTasks = columns.done.length;
  const completionRate =
    totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  const handleCreateTask = async () => {
    if (!selectedOrgId) {
      showToast('Chọn tổ chức trước khi tạo task.', 'error');
      return;
    }
    if (!formData.title.trim()) {
      showToast('Vui lòng nhập tiêu đề công việc', 'error');
      return;
    }

    try {
      setCreateTaskLoading(true);
      const body = {
        title: formData.title.trim(),
        description: formData.description.trim(),
        organizationId: selectedOrgId,
        priority: formData.priority,
        tags: [],
      };
      if (formData.assigneeId) body.assigneeId = formData.assigneeId;
      if (formData.dueDate) {
        body.dueDate = new Date(`${formData.dueDate}T12:00:00`).toISOString();
      }

      await taskAPI.createTask(body);
      showToast('Tạo công việc thành công!', 'success');
      setShowCreateTaskModal(false);
      setFormData({
        title: '',
        priority: 'medium',
        assigneeId: '',
        dueDate: '',
        description: '',
      });
      await fetchTasks();
    } catch (error) {
      console.error('Lỗi tạo công việc:', error);
      showToast(error.response?.data?.message || error.message || 'Lỗi tạo công việc', 'error');
    } finally {
      setCreateTaskLoading(false);
    }
  };

  const handleSaveDetail = async () => {
    if (!selectedTask?._id) return;
    setDetailSaving(true);
    try {
      await taskAPI.updateTask(
        String(selectedTask._id),
        {
          title: detailTitle.trim(),
          description: detailDescription.trim(),
          priority: detailPriority,
        },
        taskApiOpts
      );
      showToast('Đã lưu thay đổi', 'success');
      await fetchTasks();
      setSelectedTask(null);
    } catch (e) {
      showToast(e?.response?.data?.message || e?.message || 'Lưu thất bại', 'error');
    } finally {
      setDetailSaving(false);
    }
  };

  const handleMarkDone = async () => {
    if (!selectedTask?._id) return;
    if (!taskHasProof(selectedTask)) {
      setProofModal({ open: true, task: selectedTask });
      return;
    }
    setDetailSaving(true);
    try {
      await taskAPI.updateTask(String(selectedTask._id), { status: 'done' }, taskApiOpts);
      showToast('Đã đánh dấu hoàn thành', 'success');
      await fetchTasks();
      setSelectedTask(null);
    } catch (e) {
      showToast(e?.response?.data?.message || e?.message || 'Thao tác thất bại', 'error');
    } finally {
      setDetailSaving(false);
    }
  };

  const handleDeleteTask = async () => {
    if (!selectedTask?._id) return;
    if (!window.confirm('Xóa task này?')) return;
    setDetailSaving(true);
    try {
      await taskAPI.deleteTask(String(selectedTask._id), taskApiOpts);
      showToast('Đã xóa task', 'success');
      await fetchTasks();
      setSelectedTask(null);
    } catch (e) {
      showToast(e?.response?.data?.message || e?.message || 'Xóa thất bại', 'error');
    } finally {
      setDetailSaving(false);
    }
  };

  const colToStatus = (col) => {
    if (col === COL_DONE) return 'done';
    if (col === COL_PROGRESS) return 'in_progress';
    return 'todo';
  };

  const handleKanbanDrop = useCallback(
    async (task, _fromCol, toCol) => {
      const next = colToStatus(toCol);
      if (next === task.status) return;

      if (toCol === COL_DONE && !taskHasProof(task)) {
        setProofModal({ open: true, task });
        return;
      }

      try {
        await taskAPI.updateTask(String(task._id), { status: next }, taskApiOpts);
        showToast('Đã cập nhật trạng thái', 'success');
        await fetchTasks();
      } catch (e) {
        showToast(e?.response?.data?.message || e?.message || 'Không thể di chuyển task', 'error');
      }
    },
    [fetchTasks, taskApiOpts]
  );

  const submitProofAndDone = async () => {
    const t = proofModal.task;
    if (!t?._id) return;
    if (!proofFiles.length) {
      showToast('Chọn ít nhất một file minh chứng (ảnh, tài liệu…)', 'error');
      return;
    }
    for (const f of proofFiles) {
      if (f.size > PROOF_MAX_BYTES) {
        showToast(`File "${f.name}" vượt quá 5MB`, 'error');
        return;
      }
    }
    setProofSubmitting(true);
    try {
      const newAtt = await Promise.all(
        proofFiles.map(
          (file) =>
            new Promise((resolve, reject) => {
              const r = new FileReader();
              r.onload = () => resolve({ name: file.name, url: r.result });
              r.onerror = reject;
              r.readAsDataURL(file);
            })
        )
      );
      const merged = [...(t.attachments || []), ...newAtt];
      await taskAPI.updateTask(String(t._id), { status: 'done', attachments: merged }, taskApiOpts);
      showToast('Đã hoàn thành với minh chứng đính kèm', 'success');
      setProofModal({ open: false, task: null });
      setProofFiles([]);
      await fetchTasks();
      setSelectedTask((prev) => (prev && String(prev._id) === String(t._id) ? null : prev));
    } catch (e) {
      showToast(e?.response?.data?.message || e?.message || 'Lỗi khi lưu', 'error');
    } finally {
      setProofSubmitting(false);
    }
  };

  const renderKanbanCardInner = (task, name, { glow: _glow, doneStyle = false }) => {
    const tags = Array.isArray(task.tags) ? task.tags : [];
    const commentsCount = Array.isArray(task.comments) ? task.comments.length : 0;
    const attachmentsCount = Array.isArray(task.attachments) ? task.attachments.length : 0;
    const initial = initialsFromName(name);

    return (
      <>
        <div className={`w-full h-1 rounded-full bg-gradient-to-r ${getPriorityColor(task.priority)} mb-3`} />

        <div className="flex items-start gap-2 mb-2">
          {task.status === 'cancelled' && (
            <span className="text-xs px-2 py-0.5 rounded bg-white/10 text-amber-200 shrink-0">Đã hủy</span>
          )}
          <h3
            className={`font-bold text-white flex-1 group-hover:text-purple-200 transition-colors ${
              doneStyle ? 'line-through' : ''
            }`}
          >
            {task.title}
          </h3>
        </div>

        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {tags.map((tag, idx) => (
              <span key={idx} className="px-2 py-0.5 rounded-full glass text-xs text-gray-300">
                {tag}
              </span>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between text-xs text-gray-400">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center text-[10px] font-bold text-white shrink-0"
              title={name}
            >
              {initial}
            </span>
            <span className="truncate text-gray-300">{name}</span>
          </div>
          <span
            className={`px-2 py-1 rounded-lg text-[10px] font-bold bg-gradient-to-r ${getPriorityColor(
              task.priority
            )} text-white shrink-0`}
          >
            {getPriorityLabel(task.priority)}
          </span>
        </div>

        <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
          <span className="flex items-center gap-1">📅 {formatDueDate(task.dueDate)}</span>
          <span className="flex items-center gap-2">
            {commentsCount > 0 && <span>💬 {commentsCount}</span>}
            {attachmentsCount > 0 && <span>📎 {attachmentsCount}</span>}
          </span>
        </div>
      </>
    );
  };

  const listRows = useMemo(() => {
    return filteredTasks.map((t) => ({
      ...t,
      _col: columnForStatus(t.status),
    }));
  }, [filteredTasks]);

  const orgSelectDisabled = organizations.length === 0;

  return (
    <ThreeFrameLayout
      center={
        <div className="flex flex-col h-full">
          <div className="p-6 glass-strong border-b border-white/10">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between mb-6">
              <div>
                <h1 className="text-4xl font-black text-gradient mb-2">Bảng Công Việc</h1>
                <p className="text-gray-400">Task theo tổ chức — dữ liệu từ server</p>
              </div>
              <div className="flex flex-wrap gap-3 items-center">
                <label className="flex items-center gap-2 text-sm text-gray-400">
                  <span>Tổ chức</span>
                  <select
                    value={selectedOrgId}
                    onChange={(e) => setSelectedOrgId(e.target.value)}
                    disabled={orgSelectDisabled}
                    className="px-3 py-2 rounded-xl glass border border-white/20 text-white text-sm min-w-[180px] disabled:opacity-50"
                  >
                    {organizations.length === 0 ? (
                      <option value="">Chưa có tổ chức</option>
                    ) : (
                      organizations.map((o) => {
                        const id = String(o._id || o.id);
                        return (
                          <option key={id} value={id}>
                            {o.name || id}
                          </option>
                        );
                      })
                    )}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={() => setViewMode(viewMode === 'kanban' ? 'list' : 'kanban')}
                  className="glass px-4 py-2 rounded-xl hover:bg-white/10 transition-all flex items-center gap-2 font-semibold"
                >
                  <span>{viewMode === 'kanban' ? '📋' : '📊'}</span>
                  {viewMode === 'kanban' ? 'Danh sách' : 'Kanban'}
                </button>
                <GradientButton
                  variant="primary"
                  onClick={() => setShowCreateTaskModal(true)}
                  disabled={!selectedOrgId}
                >
                  <span className="text-xl mr-2">➕</span> Công Việc Mới
                </GradientButton>
              </div>
            </div>

            {loadError && (
              <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                {loadError}
              </div>
            )}

            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex gap-6 flex-wrap">
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center text-xl">
                    📊
                  </div>
                  <div>
                    <div className="text-sm text-gray-400">Tổng (đang lọc)</div>
                    <div className="text-lg font-bold text-white">{totalTasks}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-xl">
                    ⏳
                  </div>
                  <div>
                    <div className="text-sm text-gray-400">Đang làm + review</div>
                    <div className="text-lg font-bold text-white">{columns.inProgress.length}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center text-xl">
                    ✅
                  </div>
                  <div>
                    <div className="text-sm text-gray-400">Hoàn thành</div>
                    <div className="text-lg font-bold text-gradient">
                      {completedTasks} ({completionRate}%)
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-2 flex-wrap">
                <select
                  value={filterPriority}
                  onChange={(e) => setFilterPriority(e.target.value)}
                  className="px-4 py-2 rounded-xl glass border border-white/20 focus:border-purple-500 outline-none text-white text-sm"
                >
                  <option value="all">Tất cả ưu tiên</option>
                  <option value="urgent">Khẩn cấp</option>
                  <option value="high">Cao</option>
                  <option value="medium">Trung bình</option>
                  <option value="low">Thấp</option>
                </select>
                <select
                  value={filterAssignee}
                  onChange={(e) => setFilterAssignee(e.target.value)}
                  className="px-4 py-2 rounded-xl glass border border-white/20 focus:border-purple-500 outline-none text-white text-sm max-w-[240px]"
                >
                  <option value="all">Tất cả người làm</option>
                  <option value="unassigned">Chưa gán</option>
                  {Object.entries(userNameMap).map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="flex-1 p-6">
            {loading ? (
              <div className="py-20 text-center text-gray-400">Đang tải task…</div>
            ) : !selectedOrgId ? (
              <div className="py-20 text-center text-gray-400">
                Tham gia một tổ chức để xem và tạo công việc.
              </div>
            ) : filteredTasks.length === 0 ? (
              <div className="py-20 text-center text-gray-400">
                Chưa có task nào (hoặc không khớp bộ lọc).
              </div>
            ) : viewMode === 'kanban' ? (
              <div className="space-y-3">
                <TasksKanbanDnd
                  columns={columns}
                  getAssigneeLabel={assigneeName}
                  onCardClick={(task) => setSelectedTask(task)}
                  onDropOnColumn={handleKanbanDrop}
                  renderCardInner={renderKanbanCardInner}
                />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowCreateTaskModal(true)}
                    className="w-full py-3 glass rounded-xl hover:bg-white/10 transition-all text-gray-400 hover:text-white flex items-center justify-center gap-2"
                  >
                    <span>➕</span> Thêm công việc
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCreateTaskModal(true)}
                    className="w-full py-3 glass rounded-xl hover:bg-white/10 transition-all text-gray-400 hover:text-white flex items-center justify-center gap-2"
                  >
                    <span>➕</span> Thêm công việc
                  </button>
                  <div className="hidden md:block" aria-hidden />
                </div>
              </div>
            ) : (
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
                {listRows.map((task) => {
                  const col = task._col;
                  const statusColor =
                    col === 'done'
                      ? 'from-green-500 to-emerald-500'
                      : col === 'inProgress'
                        ? 'from-blue-500 to-cyan-500'
                        : 'from-purple-600 to-pink-600';
                  return (
                    <GlassCard
                      key={String(task._id)}
                      hover
                      className="cursor-pointer"
                      onClick={() => setSelectedTask(task)}
                    >
                      <div className="grid grid-cols-12 gap-4 items-center">
                        <div className="col-span-4 min-w-0">
                          <div
                            className={`w-full h-1 rounded-full bg-gradient-to-r ${getPriorityColor(
                              task.priority
                            )} mb-2`}
                          />
                          <h3
                            className={`font-bold text-white truncate ${
                              task.status === 'done' ? 'line-through opacity-75' : ''
                            }`}
                          >
                            {task.title}
                          </h3>
                          {Array.isArray(task.tags) && task.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {task.tags.map((tag, idx) => (
                                <span key={idx} className="px-2 py-0.5 rounded-full glass text-xs text-gray-400">
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="col-span-2 text-sm text-gray-300 truncate">
                          {assigneeName(task)}
                        </div>
                        <div className="col-span-2">
                          <span
                            className={`px-3 py-1 rounded-lg text-xs font-bold bg-gradient-to-r ${statusColor} text-white inline-block`}
                          >
                            {statusLabelVi(task.status)}
                          </span>
                        </div>
                        <div className="col-span-2">
                          <span
                            className={`px-2 py-1 rounded-lg text-xs font-bold bg-gradient-to-r ${getPriorityColor(
                              task.priority
                            )} text-white inline-block`}
                          >
                            {getPriorityLabel(task.priority)}
                          </span>
                        </div>
                        <div className="col-span-2 text-sm text-gray-400">
                          📅 {formatDueDate(task.dueDate)}
                        </div>
                      </div>
                    </GlassCard>
                  );
                })}
              </div>
            )}
          </div>

          <Modal
            isOpen={selectedTask !== null}
            onClose={() => setSelectedTask(null)}
            title={detailTitle || 'Chi tiết công việc'}
            size="lg"
          >
            {selectedTask && (
              <div className="space-y-6">
                <div className="flex items-start gap-4">
                  <div
                    className={`w-16 h-16 rounded-xl bg-gradient-to-br ${getPriorityColor(
                      detailPriority
                    )} flex items-center justify-center text-2xl font-black text-white shadow-lg`}
                  >
                    {initialsFromName(detailTitle)}
                  </div>
                  <div className="flex-1 space-y-2">
                    <input
                      type="text"
                      value={detailTitle}
                      onChange={(e) => setDetailTitle(e.target.value)}
                      className="text-2xl font-bold text-white bg-transparent border-b-2 border-white/20 hover:border-purple-500 focus:border-purple-500 outline-none w-full transition-all"
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`px-3 py-1 rounded-lg text-xs font-bold bg-gradient-to-r ${getPriorityColor(
                          detailPriority
                        )} text-white`}
                      >
                        {getPriorityLabel(detailPriority)}
                      </span>
                      <span className="text-sm text-gray-400">{statusLabelVi(selectedTask.status)}</span>
                      <span className="text-sm text-gray-400">📅 {formatDueDate(selectedTask.dueDate)}</span>
                      {selectedTask.completedAt && (
                        <span className="text-sm text-green-400">
                          ✓ Hoàn thành lúc {formatDueDate(selectedTask.completedAt)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <GlassCard>
                    <h4 className="font-semibold text-white mb-3 flex items-center gap-2">
                      <span>👤</span> Người phụ trách
                    </h4>
                    <p className="text-white">{assigneeName(selectedTask)}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      Đổi người nhận có thể bổ sung sau (API assign).
                    </p>
                  </GlassCard>
                  <GlassCard>
                    <h4 className="font-semibold text-white mb-3">Ưu tiên</h4>
                    <select
                      value={detailPriority}
                      onChange={(e) => setDetailPriority(e.target.value)}
                      className="w-full glass px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white"
                    >
                      <option value="low">Thấp</option>
                      <option value="medium">Trung bình</option>
                      <option value="high">Cao</option>
                      <option value="urgent">Khẩn cấp</option>
                    </select>
                  </GlassCard>
                </div>

                <GlassCard>
                  <h4 className="font-semibold text-white mb-3 flex items-center gap-2">
                    <span>📝</span> Mô tả
                  </h4>
                  <textarea
                    value={detailDescription}
                    onChange={(e) => setDetailDescription(e.target.value)}
                    rows={4}
                    className="w-full px-4 py-3 rounded-xl glass border border-white/20 focus:border-purple-500 outline-none text-white resize-none"
                  />
                </GlassCard>

                {Array.isArray(selectedTask.comments) && selectedTask.comments.length > 0 && (
                  <GlassCard>
                    <h4 className="font-semibold text-white mb-3">
                      💬 Bình luận ({selectedTask.comments.length})
                    </h4>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {selectedTask.comments.map((c, idx) => (
                        <div key={idx} className="p-3 glass-strong rounded-lg text-sm text-gray-300">
                          <div className="text-xs text-gray-500 mb-1">
                            User {String(c.userId || '').slice(-6)} ·{' '}
                            {c.createdAt ? formatDueDate(c.createdAt) : ''}
                          </div>
                          {c.content}
                        </div>
                      ))}
                    </div>
                  </GlassCard>
                )}

                <div className="flex gap-3 pt-4 border-t border-white/10 flex-wrap">
                  {selectedTask.status !== 'done' && (
                    <GradientButton variant="success" className="flex-1 min-w-[120px]" onClick={handleMarkDone} disabled={detailSaving}>
                      ✓ Hoàn thành
                    </GradientButton>
                  )}
                  <GradientButton variant="primary" className="flex-1 min-w-[120px]" onClick={handleSaveDetail} disabled={detailSaving}>
                    {detailSaving ? 'Đang lưu…' : 'Lưu thay đổi'}
                  </GradientButton>
                  <button
                    type="button"
                    onClick={handleDeleteTask}
                    disabled={detailSaving}
                    className="glass px-4 py-3 rounded-xl hover:bg-red-500/20 text-red-400"
                  >
                    🗑️ Xóa
                  </button>
                </div>
              </div>
            )}
          </Modal>

          <Modal
            isOpen={proofModal.open}
            onClose={() => {
              if (!proofSubmitting) {
                setProofModal({ open: false, task: null });
                setProofFiles([]);
              }
            }}
            title="Minh chứng hoàn thành"
            size="lg"
          >
            <p className="text-sm text-slate-400 mb-4">
              Để chuyển task sang <strong className="text-white">Hoàn thành</strong>, cần đính kèm ít nhất một
              file minh chứng (ảnh chụp màn hình, PDF, báo cáo…). File được lưu kèm task (data URL, phù hợp file
              nhỏ).
            </p>
            {proofModal.task && (
              <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white mb-4">
                {proofModal.task.title}
              </div>
            )}
            <label className="block text-sm font-semibold text-gray-400 mb-2">Chọn file</label>
            <input
              type="file"
              multiple
              accept="image/*,.pdf,.doc,.docx,.zip"
              disabled={proofSubmitting}
              onChange={(e) => setProofFiles(Array.from(e.target.files || []))}
              className="w-full text-sm text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-purple-600 file:px-3 file:py-2 file:text-white"
            />
            {proofFiles.length > 0 && (
              <ul className="mt-3 text-xs text-slate-400 space-y-1">
                {proofFiles.map((f) => (
                  <li key={f.name + f.size}>
                    📎 {f.name} ({Math.round(f.size / 1024)} KB)
                  </li>
                ))}
              </ul>
            )}
            <div className="flex gap-3 mt-6 justify-end">
              <button
                type="button"
                disabled={proofSubmitting}
                onClick={() => {
                  setProofModal({ open: false, task: null });
                  setProofFiles([]);
                }}
                className="glass px-4 py-2 rounded-xl text-slate-200 hover:bg-white/10"
              >
                Hủy
              </button>
              <GradientButton variant="primary" disabled={proofSubmitting} onClick={submitProofAndDone}>
                {proofSubmitting ? 'Đang lưu…' : 'Xác nhận hoàn thành'}
              </GradientButton>
            </div>
          </Modal>

          <Modal
            isOpen={showCreateTaskModal}
            onClose={() => setShowCreateTaskModal(false)}
            title="Tạo công việc mới"
            size="lg"
          >
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-400 mb-2">
                  Tiêu đề <span className="text-red-400">*</span>
                </label>
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
                    <option value="urgent">Khẩn cấp</option>
                    <option value="high">Cao</option>
                    <option value="medium">Trung bình</option>
                    <option value="low">Thấp</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-400 mb-2">Người làm (tuỳ chọn)</label>
                  <select
                    value={formData.assigneeId}
                    onChange={(e) => setFormData({ ...formData, assigneeId: e.target.value })}
                    disabled={createTaskLoading}
                    className="w-full glass px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white disabled:opacity-50"
                  >
                    <option value="">— Chưa gán —</option>
                    {Object.entries(userNameMap).map(([id, label]) => (
                      <option key={id} value={id}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-400 mb-2">Hạn hoàn thành (tuỳ chọn)</label>
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
                  placeholder="Mô tả chi tiết..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  disabled={createTaskLoading}
                  className="w-full glass px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-purple-500/50 focus:outline-none text-white placeholder-gray-500 transition-all resize-none disabled:opacity-50"
                />
              </div>

              <div className="flex gap-3">
                <GradientButton
                  variant="primary"
                  onClick={handleCreateTask}
                  disabled={createTaskLoading || !selectedOrgId}
                  className="flex-1 disabled:opacity-50"
                >
                  {createTaskLoading ? '⏳ Đang tạo...' : '✅ Tạo công việc'}
                </GradientButton>
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateTaskModal(false);
                    setFormData({
                      title: '',
                      priority: 'medium',
                      assigneeId: '',
                      dueDate: '',
                      description: '',
                    });
                  }}
                  disabled={createTaskLoading}
                  className="glass px-6 py-3 rounded-xl hover:bg-white/10 transition-all font-semibold disabled:opacity-50"
                >
                  Hủy
                </button>
              </div>
            </div>
          </Modal>

          {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
        </div>
      }
    />
  );
}
