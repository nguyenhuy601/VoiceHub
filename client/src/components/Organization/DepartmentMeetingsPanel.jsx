import { useCallback, useEffect, useMemo, useState } from 'react';
import { Calendar, Plus, Video } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAppStrings } from '../../locales/appStrings';
import meetingAPI from '../../services/api/meetingAPI';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? res;
}

/**
 * Calendar + Meetings cấp phòng ban (sự kiện, không voice room cố định).
 */
export default function DepartmentMeetingsPanel({
  organizationId = '',
  departmentId = '',
  departmentName = '',
  mode = 'meetings',
  canManage = false,
  isDarkMode = false,
  /** Post Join link vào kênh announcement phòng (Pha 3). */
  onAnnounceMeetingJoin,
}) {
  const { t } = useAppStrings();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');

  const muted = isDarkMode ? 'text-slate-400' : 'text-muted-foreground';
  const titleCls = isDarkMode ? 'text-white' : 'text-foreground';

  const load = useCallback(async () => {
    const orgId = String(organizationId || '').trim();
    if (!orgId) {
      setItems([]);
      return;
    }
    setLoading(true);
    try {
      const now = new Date();
      const startFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const startTo = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000).toISOString();
      const res = await meetingAPI.getMeetings({
        organizationId: orgId,
        startFrom,
        startTo,
      });
      const data = unwrap(res);
      const list = Array.isArray(data) ? data : data?.items || data?.meetings || [];
      const deptId = String(departmentId || '').trim();
      const filtered = deptId
        ? list.filter((m) => {
            const mid = String(m?.departmentId || m?.department || m?.metadata?.departmentId || '');
            const label = String(m?.title || m?.name || '');
            return mid === deptId || (departmentName && label.includes(String(departmentName)));
          })
        : list;
      setItems(filtered);
    } catch (err) {
      toast.error(resolveApiErrorMessage(err, { t, fallback: t('workspace.deptMeetingsLoadFail') }));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [organizationId, departmentId, departmentName, t]);

  useEffect(() => {
    load();
  }, [load]);

  const sorted = useMemo(
    () =>
      [...items].sort(
        (a, b) =>
          new Date(a.startAt || a.scheduledAt || a.createdAt || 0).getTime() -
          new Date(b.startAt || b.scheduledAt || b.createdAt || 0).getTime()
      ),
    [items]
  );

  const handleCreate = async () => {
    const orgId = String(organizationId || '').trim();
    const name = String(title || '').trim();
    if (!orgId || !name || !canManage || creating) return;
    setCreating(true);
    try {
      const start = new Date(Date.now() + 60 * 60 * 1000);
      const res = await meetingAPI.createMeeting({
        organizationId: orgId,
        title: name,
        name,
        startAt: start.toISOString(),
        departmentId: String(departmentId || '').trim() || undefined,
        metadata: { departmentId: String(departmentId || '').trim() },
      });
      const created = unwrap(res);
      const meetingId = String(created?._id || created?.id || '');
      setTitle('');
      toast.success(t('workspace.deptMeetingCreated'));
      if (meetingId && typeof onAnnounceMeetingJoin === 'function') {
        const joinPath = `/app/voice?meetingId=${encodeURIComponent(meetingId)}`;
        try {
          await onAnnounceMeetingJoin({
            meetingId,
            title: name,
            joinPath,
            startAt: start.toISOString(),
          });
        } catch {
          /* announce best-effort — meeting đã tạo */
        }
      }
      await load();
    } catch (err) {
      toast.error(resolveApiErrorMessage(err, { t, fallback: t('workspace.deptMeetingCreateFail') }));
    } finally {
      setCreating(false);
    }
  };

  const Icon = mode === 'calendar' ? Calendar : Video;
  const heading =
    mode === 'calendar' ? t('workspace.moduleCalendar') : t('workspace.moduleMeetings');

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden px-4 py-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Icon size={18} className="text-primary" />
        <h3 className={`text-sm font-bold ${titleCls}`}>{heading}</h3>
        {loading ? <span className={`text-xs ${muted}`}>…</span> : null}
      </div>

      {canManage ? (
        <div className="mb-4 flex flex-wrap gap-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('workspace.deptMeetingTitlePh')}
            className="min-w-[200px] flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <button
            type="button"
            disabled={creating || !title.trim()}
            onClick={handleCreate}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            <Plus size={14} />
            {t('workspace.deptMeetingCreate')}
          </button>
        </div>
      ) : null}

      {sorted.length === 0 ? (
        <p className={`rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm ${muted}`}>
          {t('workspace.deptMeetingsEmpty')}
        </p>
      ) : (
        <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto">
          {sorted.map((m) => {
            const id = String(m._id || m.id);
            const when = m.startAt || m.scheduledAt || m.createdAt;
            const whenLabel = when ? new Date(when).toLocaleString() : '—';
            const joinPath = id ? `/app/voice?meetingId=${encodeURIComponent(id)}` : '';
            return (
              <li
                key={id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface px-3 py-2.5"
              >
                <div className="min-w-0">
                  <div className={`truncate text-sm font-semibold ${titleCls}`}>
                    {m.title || m.name || id}
                  </div>
                  <div className={`text-xs ${muted}`}>{whenLabel}</div>
                </div>
                {joinPath ? (
                  <a
                    href={joinPath}
                    className="shrink-0 rounded-lg border border-primary/40 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary hover:bg-primary/20"
                  >
                    {t('workspace.deptMeetingJoin')}
                  </a>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
