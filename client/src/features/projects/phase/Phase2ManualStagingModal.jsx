import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { projectAPI } from '../../../services/api/projectAPI';
import { useAppStrings } from '../../../locales/appStrings';
import { resolveApiErrorMessage } from '../../../utils/resolveApiErrorMessage';
import Modal from '../../../components/Shared/Modal';

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? res;
}

function newLocalId() {
  return `new_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

const STAGING_PAGE_SIZE = 10;

function personLabel(row, unassigned) {
  const email = String(row?.assigneeEmail || '').trim();
  if (email) return email;
  const name = String(row?.assigneeName || '').trim();
  if (name) return name;
  return unassigned;
}

function LockedColumnHeader({ label, whyLabel, onWhy }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span>{label}</span>
      <button type="button" className="font-semibold text-primary hover:underline" onClick={onWhy}>
        {whyLabel}
      </button>
    </span>
  );
}

/**
 * PM staging table before Phase 2 Manual → submit to PO (does not advance phase).
 */
export default function Phase2ManualStagingModal({
  projectId,
  methodology: initialMethodology = 'kanban',
  open,
  onClose,
  onSubmitted,
}) {
  const { t } = useAppStrings();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [methodology, setMethodology] = useState(initialMethodology);
  const [rows, setRows] = useState([]);
  const [note, setNote] = useState('');
  const [status, setStatus] = useState('draft');
  const [reviewNote, setReviewNote] = useState('');
  const [lockPopup, setLockPopup] = useState(null);
  const [page, setPage] = useState(0);

  const load = useCallback(async () => {
    if (!projectId || !open) return;
    setLoading(true);
    try {
      const data = unwrap(
        await projectAPI.advancePhase2(projectId, { action: 'preview_staging' })
      );
      setRows(Array.isArray(data?.rows) ? data.rows : []);
      setMethodology(data?.methodology || initialMethodology || 'kanban');
      setNote(data?.note || '');
      setStatus(data?.status || 'draft');
      setReviewNote(data?.reviewNote || '');
      setPage(0);
    } catch (err) {
      toast.error(
        resolveApiErrorMessage(err, {
          t,
          fallback: t('workspace.phase2StagingLoadFail') || 'Không tải được bảng staging',
        })
      );
    } finally {
      setLoading(false);
    }
  }, [projectId, open, initialMethodology, t]);

  useEffect(() => {
    load();
  }, [load]);

  const updateRow = (localId, patch) => {
    const safe = { ...patch };
    delete safe.assigneeUserId;
    delete safe.assigneeEmail;
    delete safe.assigneeName;
    delete safe.startDate;
    setRows((prev) =>
      prev.map((r) => {
        if (r.localId !== localId) return r;
        const next = { ...r, ...safe };
        if (r.changeType === 'from_wbs' && patch.title != null && patch.title !== r.title) {
          next.changeType = 'edited';
        }
        return next;
      })
    );
  };

  const addRow = () => {
    setRows((prev) => [
      ...prev,
      {
        localId: newLocalId(),
        sourceArtifactId: null,
        externalKey: '',
        title: '',
        estimateHours: null,
        assigneeUserId: null,
        assigneeEmail: '',
        assigneeName: '',
        startDate: '',
        columnHint: 'Backlog',
        changeType: 'added',
      },
    ]);
    setPage(Math.floor(visibleRows.length / STAGING_PAGE_SIZE));
  };

  const removeRow = (localId) => {
    setRows((prev) =>
      prev.map((r) =>
        r.localId === localId
          ? { ...r, changeType: 'removed' }
          : r
      )
    );
  };

  const visibleRows = rows.filter((r) => r.changeType !== 'removed');
  const pageCount = Math.max(1, Math.ceil(visibleRows.length / STAGING_PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageStart = safePage * STAGING_PAGE_SIZE;
  const pageRows = visibleRows.slice(pageStart, pageStart + STAGING_PAGE_SIZE);

  const onSubmit = async () => {
    if (!projectId || busy) return;
    const active = visibleRows.filter((r) => String(r.title || '').trim());
    if (!active.length) {
      toast.error(t('workspace.phase2StagingNeedRows') || 'Cần ít nhất một dòng có tiêu đề');
      return;
    }
    setBusy(true);
    try {
      await projectAPI.advancePhase2(projectId, {
        action: 'submit_staging',
        methodology,
        rows,
        note,
      });
      toast.success(
        t('workspace.phase2StagingSubmitted') || 'Đã gửi PO duyệt — chưa chuyển Development'
      );
      onSubmitted?.();
      onClose?.();
    } catch (err) {
      toast.error(
        resolveApiErrorMessage(err, {
          t,
          fallback: t('workspace.phase2StagingSubmitFail') || 'Không gửi được staging',
        })
      );
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        className="flex max-h-[90vh] w-full max-w-5xl flex-col rounded-xl border border-border bg-surface shadow-lg"
      >
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-base font-semibold text-foreground">
            {t('workspace.phase2StagingTitle') || 'Bảng preview Phase 2 (Thủ công)'}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {t('workspace.phase2StagingHint') ||
              'Chỉnh Backlog/Board preview từ WBS đã duyệt. Gửi PO duyệt — chưa chuyển Development.'}
          </p>
          {status === 'changes_requested' ? (
            <div className="mt-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-2">
              <p className="text-xs font-medium text-amber-800 dark:text-amber-200">
                {t('workspace.phase2StagingChangesRequested')}
              </p>
              {reviewNote ? (
                <p className="mt-1 whitespace-pre-wrap text-xs text-foreground">{reviewNote}</p>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-end gap-3 border-b border-border px-4 py-2">
          <label className="text-sm">
            <span className="text-xs font-medium text-muted-foreground">
              {t('workspace.phase2Methodology')}
            </span>
            <select
              className="mt-1 block rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
              value={methodology}
              onChange={(e) => setMethodology(e.target.value)}
              disabled={busy || loading}
            >
              <option value="kanban">Kanban</option>
              <option value="scrum">Scrum</option>
              <option value="waterfall">Waterfall</option>
            </select>
          </label>
          <label className="min-w-[12rem] flex-1 text-sm">
            <span className="text-xs font-medium text-muted-foreground">
              {t('workspace.phase2StagingNote') || 'Ghi chú cho PO'}
            </span>
            <input
              className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={busy || loading}
            />
          </label>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-4 py-3">
          <p className="mb-2 text-xs text-muted-foreground">
            {t('workspace.phase2StagingColumnNote')}
          </p>
          <p className="mb-2 text-xs text-muted-foreground">
            {t('workspace.phase2StagingBlankSource')}
          </p>
          {loading ? (
            <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="py-1.5 pr-2 font-medium">{t('workspace.phase2StagingColKey')}</th>
                  <th className="py-1.5 pr-2 font-medium">{t('workspace.phase2StagingColTitle')}</th>
                  <th className="w-24 py-1.5 pr-2 font-medium">{t('workspace.phase2StagingColEstimate')}</th>
                  <th className="py-1.5 pr-2 font-medium">
                    <LockedColumnHeader
                      label={t('workspace.phase2StagingColAssignee')}
                      whyLabel={t('workspace.phase2StagingWhyLocked')}
                      onWhy={() => setLockPopup('assignee')}
                    />
                  </th>
                  <th className="w-36 py-1.5 pr-2 font-medium">
                    <LockedColumnHeader
                      label={t('workspace.phase2StagingColStart')}
                      whyLabel={t('workspace.phase2StagingWhyLocked')}
                      onWhy={() => setLockPopup('startDate')}
                    />
                  </th>
                  <th className="w-28 py-1.5 pr-2 font-medium">{t('workspace.phase2StagingColColumn')}</th>
                  <th className="w-16 py-1.5" />
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r) => (
                  <tr key={r.localId} className="border-b border-border/60">
                    <td className="py-1.5 pr-2 align-top">
                      <input
                        className="w-full rounded border border-border bg-background px-1.5 py-1 text-xs"
                        value={r.externalKey || ''}
                        onChange={(e) => updateRow(r.localId, { externalKey: e.target.value })}
                        disabled={busy}
                      />
                    </td>
                    <td className="py-1.5 pr-2 align-top">
                      <input
                        className="w-full rounded border border-border bg-background px-1.5 py-1 text-xs"
                        value={r.title || ''}
                        onChange={(e) => updateRow(r.localId, { title: e.target.value })}
                        disabled={busy}
                        placeholder={t('workspace.phase2StagingUntitled')}
                      />
                      {r.changeType === 'added' || r.changeType === 'edited' ? (
                        <span className="mt-0.5 block text-[10px] text-primary">
                          {r.changeType === 'added'
                            ? t('workspace.phase2StagingChangeAdded')
                            : r.changeType === 'edited'
                              ? t('workspace.phase2StagingChangeEdited')
                              : r.changeType}
                        </span>
                      ) : null}
                    </td>
                    <td className="py-1.5 pr-2 align-top">
                      <input
                        type="number"
                        min={0}
                        className="w-full rounded border border-border bg-background px-1.5 py-1 text-xs"
                        value={r.estimateHours ?? ''}
                        onChange={(e) =>
                          updateRow(r.localId, {
                            estimateHours:
                              e.target.value === '' ? null : Number(e.target.value),
                          })
                        }
                        disabled={busy}
                      />
                    </td>
                    <td className="py-1.5 pr-2 align-top text-xs text-foreground">
                      {personLabel(r, t('workspace.phase2StagingUnassigned'))}
                    </td>
                    <td className="py-1.5 pr-2 align-top text-xs text-muted-foreground">
                      {r.startDate || '—'}
                    </td>
                    <td className="py-1.5 pr-2 align-top">
                      <input
                        className="w-full rounded border border-border bg-background px-1.5 py-1 text-xs"
                        value={r.columnHint || ''}
                        onChange={(e) => updateRow(r.localId, { columnHint: e.target.value })}
                        disabled={busy}
                      />
                    </td>
                    <td className="py-1.5 align-top">
                      <button
                        type="button"
                        className="text-xs text-destructive hover:underline"
                        onClick={() => removeRow(r.localId)}
                        disabled={busy}
                      >
                        {t('common.delete') || 'Xóa'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!loading ? (
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                className="text-xs font-semibold text-primary hover:underline"
                onClick={addRow}
                disabled={busy}
              >
                + {t('workspace.phase2StagingAddRow') || 'Thêm dòng'}
              </button>
              {visibleRows.length > STAGING_PAGE_SIZE ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <button
                    type="button"
                    className="rounded border border-border px-2 py-1 disabled:opacity-40"
                    disabled={safePage <= 0}
                    onClick={() => setPage(safePage - 1)}
                  >
                    {t('workspace.phase2StagingPagePrev')}
                  </button>
                  <span>
                    {t('workspace.phase2StagingPage', {
                      from: pageStart + 1,
                      to: Math.min(pageStart + STAGING_PAGE_SIZE, visibleRows.length),
                      total: visibleRows.length,
                    })}
                  </span>
                  <button
                    type="button"
                    className="rounded border border-border px-2 py-1 disabled:opacity-40"
                    disabled={safePage >= pageCount - 1}
                    onClick={() => setPage(safePage + 1)}
                  >
                    {t('workspace.phase2StagingPageNext')}
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
          <button
            type="button"
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold"
            onClick={onClose}
            disabled={busy}
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
            onClick={onSubmit}
            disabled={busy || loading || !visibleRows.length}
          >
            {busy
              ? t('common.saving')
              : t('workspace.phase2StagingSubmitPo') || 'Gửi PO duyệt'}
          </button>
        </div>
      </div>
      <Modal
        isOpen={lockPopup === 'assignee' || lockPopup === 'startDate'}
        onClose={() => setLockPopup(null)}
        size="sm"
        layerClassName="z-[200]"
        title={
          lockPopup === 'startDate'
            ? t('workspace.phase2StagingWhyStartTitle')
            : t('workspace.phase2StagingWhyAssigneeTitle')
        }
      >
        <p className="text-sm text-foreground">
          {lockPopup === 'startDate'
            ? t('workspace.phase2StagingWhyStartBody')
            : t('workspace.phase2StagingWhyAssigneeBody')}
        </p>
      </Modal>
    </div>
  );
}
