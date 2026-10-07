import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Calendar, Plus, Video } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAppStrings } from '../../locales/appStrings';
import meetingAPI from '../../services/api/meetingAPI';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import {
  adminInputClass,
  adminLabelClass,
  adminPrimaryBtnClass,
  adminSecondaryBtnClass,
} from '../adminUsers/adminUserPanelUi';

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? res;
}

function meetingStart(m) {
  return m?.startTime || m?.startAt || m?.scheduledAt || m?.createdAt || null;
}

function dayKey(value) {
  const d = value ? new Date(value) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function toLocalDatetimeInputValue(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function defaultMeetingStartLocal() {
  return toLocalDatetimeInputValue(new Date(Date.now() + 60 * 60 * 1000));
}

const TITLE_MAX = 200;

/**
 * Calendar + Meetings cấp phòng ban (sự kiện, không voice room cố định).
 * mode=calendar → timeline theo ngày; mode=meetings → danh sách họp + Join.
 * Danh sách = meeting org mà user là host/participant (API range); không lọc departmentId.
 */
export default function DepartmentMeetingsPanel({
  organizationId = '',
  departmentId = '',
  departmentName = '',
  mode = 'meetings',
  canManage = false,
  onAnnounceMeetingJoin,
}) {
  void departmentId;
  const { t, locale } = useAppStrings();
  const formId = useId();
  const titleId = `${formId}-title`;
  const startId = `${formId}-start`;
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [serviceUnavailable, setServiceUnavailable] = useState(false);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [startLocal, setStartLocal] = useState(defaultMeetingStartLocal);

  const isCalendar = mode === 'calendar';

  const load = useCallback(async () => {
    const orgId = String(organizationId || '').trim();
    if (!orgId) {
      setItems([]);
      setLoadError(false);
      setServiceUnavailable(false);
      return;
    }
    setLoading(true);
    setLoadError(false);
    setServiceUnavailable(false);
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
      setItems(list);
    } catch (err) {
      const status = Number(err?.response?.status || err?.status || 0);
      const unavailable = status === 503 || status === 502 || status === 0;
      setServiceUnavailable(unavailable);
      setItems([]);
      setLoadError(true);
      if (!unavailable) {
        toast.error(
          resolveApiErrorMessage(err, { t, fallback: t('workspace.deptMeetingsLoadFail') })
        );
      }
    } finally {
      setLoading(false);
    }
  }, [organizationId, t]);

  useEffect(() => {
    load();
  }, [load]);

  const sorted = useMemo(
    () =>
      [...items].sort(
        (a, b) => new Date(meetingStart(a) || 0).getTime() - new Date(meetingStart(b) || 0).getTime()
      ),
    [items]
  );

  const calendarGroups = useMemo(() => {
    if (!isCalendar) return [];
    const map = new Map();
    sorted.forEach((m) => {
      const when = meetingStart(m);
      const key = dayKey(when) || 'unknown';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(m);
    });
    return [...map.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  }, [isCalendar, sorted]);

  const handleCreate = async () => {
    const orgId = String(organizationId || '').trim();
    const name = String(title || '').trim();
    if (!orgId || !name || !canManage || creating) return;
    const start = new Date(startLocal);
    if (Number.isNaN(start.getTime())) {
      toast.error(t('workspace.deptMeetingStartInvalid'));
      return;
    }
    setCreating(true);
    try {
      const res = await meetingAPI.createMeeting({
        organizationId: orgId,
        title: name.slice(0, TITLE_MAX),
        name: name.slice(0, TITLE_MAX),
        startAt: start.toISOString(),
      });
      const created = unwrap(res);
      const meetingId = String(created?._id || created?.id || '');
      setTitle('');
      setStartLocal(defaultMeetingStartLocal());
      toast.success(t('workspace.deptMeetingCreated'));
      if (meetingId && typeof onAnnounceMeetingJoin === 'function') {
        const joinPath = `/app/communicate/voice/${encodeURIComponent(meetingId)}`;
        try {
          await onAnnounceMeetingJoin({
            meetingId,
            title: name,
            joinPath,
            startAt: start.toISOString(),
          });
        } catch {
          /* announce best-effort */
        }
      }
      await load();
    } catch (err) {
      toast.error(resolveApiErrorMessage(err, { t, fallback: t('workspace.deptMeetingCreateFail') }));
    } finally {
      setCreating(false);
    }
  };

  const Icon = isCalendar ? Calendar : Video;
  const heading = isCalendar ? t('workspace.moduleCalendar') : t('workspace.moduleMeetings');
  const hint = t('workspace.deptMeetingsOrgScopeNote') || t('workspace.deptMeetingsHint');
  const emptyCopy = isCalendar ? t('workspace.deptCalendarEmpty') : t('workspace.deptMeetingsEmpty');
  const dateLocale = String(locale || '').toLowerCase() === 'en' ? 'en-US' : 'vi-VN';
  const todayKey = dayKey(new Date());
  const scopeLabel = String(departmentName || '').trim();

  const renderMeetingRow = (m, { showJoin = true } = {}) => {
    const id = String(m._id || m.id);
    const when = meetingStart(m);
    const whenLabel = when
      ? new Date(when).toLocaleString(dateLocale, {
          hour: '2-digit',
          minute: '2-digit',
          ...(isCalendar ? {} : { day: 'numeric', month: 'short' }),
        })
      : '—';
    const joinPath = id ? `/app/communicate/voice/${encodeURIComponent(id)}` : '';
    return (
      <li
        key={id}
        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2.5"
      >
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-foreground">{m.title || m.name || id}</div>
          <div className="text-xs text-muted-foreground">{whenLabel}</div>
        </div>
        {showJoin && joinPath ? (
          <Link
            to={joinPath}
            className="shrink-0 rounded-lg border border-primary/40 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary hover:bg-primary/20 motion-safe:transition-colors motion-reduce:transition-none"
          >
            {t('workspace.deptMeetingJoin')}
          </Link>
        ) : null}
      </li>
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden px-4 py-4 text-foreground">
      <div className="mb-3 rounded-xl border border-border bg-card px-3 py-2.5">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <Icon size={18} className="text-primary" aria-hidden="true" />
          <h3 className="text-sm font-bold text-foreground">
            {scopeLabel ? `${heading} · ${scopeLabel}` : heading}
          </h3>
          {loading ? (
            <span
              className="inline-block h-3 w-10 rounded bg-muted motion-safe:animate-pulse"
              role="status"
              aria-label={t('common.loading')}
            />
          ) : null}
        </div>
        <p className="text-[0.6875rem] leading-relaxed text-muted-foreground">{hint}</p>
        {isCalendar ? (
          <p className="mt-1 text-[0.625rem] font-semibold uppercase tracking-wide text-muted-foreground">
            {t('workspace.deptCalendarViewOnly')}
          </p>
        ) : null}
      </div>

      {canManage && !isCalendar ? (
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="flex min-w-[200px] flex-1 flex-col gap-1">
            <label htmlFor={titleId} className={adminLabelClass()}>
              {t('workspace.deptMeetingTitlePh')}
            </label>
            <input
              id={titleId}
              value={title}
              maxLength={TITLE_MAX}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('workspace.deptMeetingTitlePh')}
              className={adminInputClass()}
            />
          </div>
          <div className="flex min-w-[180px] flex-col gap-1">
            <label htmlFor={startId} className={adminLabelClass()}>
              {t('workspace.deptMeetingStartLabel')}
            </label>
            <input
              id={startId}
              type="datetime-local"
              value={startLocal}
              onChange={(e) => setStartLocal(e.target.value)}
              className={adminInputClass('[color-scheme:light] dark:[color-scheme:dark]')}
            />
          </div>
          <button
            type="button"
            disabled={creating || !title.trim() || !startLocal}
            onClick={handleCreate}
            className={adminPrimaryBtnClass('inline-flex items-center justify-center gap-1.5')}
          >
            <Plus size={14} aria-hidden="true" />
            {t('workspace.deptMeetingCreate')}
          </button>
        </div>
      ) : null}

      {loadError ? (
        <div
          role="alert"
          className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground"
        >
          <p className="mb-3">
            {serviceUnavailable
              ? t('workspace.deptMeetingsUnavailable')
              : t('workspace.deptMeetingsLoadFail')}
          </p>
          <button type="button" onClick={() => load()} className={adminSecondaryBtnClass('text-xs')}>
            {t('workspace.deptMeetingsRetry')}
          </button>
        </div>
      ) : sorted.length === 0 && !loading ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          {emptyCopy}
        </p>
      ) : isCalendar ? (
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
          <p className="text-[0.625rem] font-bold uppercase tracking-wide text-muted-foreground">
            {t('workspace.deptCalendarSection')}
          </p>
          {calendarGroups.map(([key, rows]) => {
            const isToday = key === todayKey;
            const label =
              key === 'unknown'
                ? '—'
                : new Date(`${key}T12:00:00`).toLocaleDateString(dateLocale, {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                  });
            return (
              <section key={key} className="flex gap-3">
                <div
                  className={`w-16 shrink-0 rounded-lg border px-1.5 py-2 text-center ${
                    isToday ? 'border-primary/40 bg-primary/10' : 'border-border bg-muted/40'
                  }`}
                >
                  <div className="text-[0.6rem] font-bold uppercase text-muted-foreground">
                    {isToday ? t('workspace.deptCalendarToday') : label.split(' ')[0]}
                  </div>
                  <div className="text-sm font-bold text-foreground">
                    {key === 'unknown' ? '—' : key.split('-')[2]}
                  </div>
                </div>
                <ul className="min-w-0 flex-1 space-y-2">
                  {rows.map((m) => renderMeetingRow(m, { showJoin: true }))}
                </ul>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <p className="mb-2 text-[0.625rem] font-bold uppercase tracking-wide text-muted-foreground">
            {t('workspace.deptMeetingsSection')}
          </p>
          <ul className="space-y-2">{sorted.map((m) => renderMeetingRow(m))}</ul>
        </div>
      )}
    </div>
  );
}
