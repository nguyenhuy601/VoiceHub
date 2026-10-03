import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { projectAPI } from '../../../services/api/projectAPI';
import { useAppStrings } from '../../../locales/appStrings';
import { resolveApiErrorMessage } from '../../../utils/resolveApiErrorMessage';
import { queryKeys } from '../../../lib/queryKeys';
import { buildProjectsModulePath } from '../../../utils/suitePathUtils';
import { phaseHomeModule } from '../../../utils/projectPhaseNav';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? res;
}

function personLabel(row, unassigned) {
  const email = String(row?.assigneeEmail || '').trim();
  if (email) return email;
  const name = String(row?.assigneeName || '').trim();
  if (name) return name;
  return unassigned;
}

const REVIEW_PAGE_SIZE = 10;

/**
 * PO inbox for Phase 2 Manual staging (approve → Development).
 */
export default function Phase2PoReviewInbox({
  projectId,
  organizationId,
  stagingSummary,
  canReviewPo = false,
}) {
  const { t } = useAppStrings();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [rows, setRows] = useState([]);
  const [loadingRows, setLoadingRows] = useState(false);
  const [page, setPage] = useState(0);

  const status = String(stagingSummary?.status || '');
  const pending = status === 'po_review';

  useEffect(() => {
    if (!projectId || !pending) return undefined;
    let cancelled = false;
    setLoadingRows(true);
    setPage(0);
    projectAPI
      .advancePhase2(projectId, { action: 'preview_staging' })
      .then((res) => {
        if (cancelled) return;
        const data = unwrap(res);
        const list = Array.isArray(data?.rows) ? data.rows : [];
        setRows(list.filter((row) => row.changeType !== 'removed'));
      })
      .catch((err) => {
        if (!cancelled) {
          setRows([]);
          toast.error(
            resolveApiErrorMessage(err, {
              t,
              fallback: t('workspace.phase2StagingLoadFail'),
            })
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingRows(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, pending, t]);

  if (!pending) return null;

  const actorId = String(user?.id || user?._id || '').trim();
  const submitterId = String(stagingSummary?.submittedBy || '').trim();
  const isSubmitter = Boolean(actorId && submitterId && actorId === submitterId);
  const canDecide = canReviewPo && !isSubmitter;
  const changeNote = note.trim();
  const pageCount = Math.max(1, Math.ceil(rows.length / REVIEW_PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageStart = safePage * REVIEW_PAGE_SIZE;
  const pageRows = rows.slice(pageStart, pageStart + REVIEW_PAGE_SIZE);
  const unassigned = t('workspace.phase2StagingUnassigned');

  const onDecide = async (action) => {
    if (!projectId || busy) return;
    if (action === 'request_changes' && !changeNote) {
      toast.error(t('workspace.phase2PoReviewChangeRequired'));
      return;
    }
    setBusy(true);
    try {
      const res = await projectAPI.advancePhase2(projectId, {
        action,
        note: action === 'request_changes' ? changeNote : note || undefined,
      });
      const data = unwrap(res);
      await queryClient.invalidateQueries({ queryKey: queryKeys.projectHub.project(projectId) });
      await queryClient.invalidateQueries({
        queryKey: ['projectAnalysisGaps', String(projectId)],
      });
      if (action === 'approve_staging' && data?.advanced !== false) {
        toast.success(t('workspace.phase2AdvanceSuccess') || 'Đã chuyển Phase 2 — Development');
        navigate(
          buildProjectsModulePath(projectId, phaseHomeModule('development'), {
            organizationId,
          })
        );
      } else {
        toast.success(
          t('workspace.phase2StagingChangesSent') || 'Đã yêu cầu PM sửa staging'
        );
      }
    } catch (err) {
      toast.error(
        resolveApiErrorMessage(err, {
          t,
          fallback: t('workspace.phase2StagingReviewFail') || 'Không duyệt được staging',
        })
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-4 rounded-xl border border-violet-500/40 bg-violet-500/10 px-3 py-3 sm:px-4">
      <p className="text-sm font-semibold text-foreground">{t('workspace.phase2PoReviewTitle')}</p>
      <p className="mt-1 text-xs text-muted-foreground">{t('workspace.phase2PoReviewHint')}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {t('workspace.phase2PoReviewRows', { count: rows.length || stagingSummary?.rowCount || 0 })}
        {stagingSummary?.methodology ? ` · ${stagingSummary.methodology}` : ''}
      </p>
      {stagingSummary?.note ? (
        <p className="mt-2 text-xs text-foreground">
          <span className="font-medium">{t('workspace.phase2PoReviewPmNote')}: </span>
          {stagingSummary.note}
        </p>
      ) : null}

      {loadingRows ? (
        <p className="mt-3 text-xs text-muted-foreground">{t('common.loading')}</p>
      ) : rows.length ? (
        <div className="mt-3 overflow-x-auto rounded-lg border border-border bg-background">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="px-2 py-1.5 font-medium">{t('workspace.phase2StagingColKey')}</th>
                <th className="px-2 py-1.5 font-medium">{t('workspace.phase2StagingColTitle')}</th>
                <th className="px-2 py-1.5 font-medium">{t('workspace.phase2StagingColEstimate')}</th>
                <th className="px-2 py-1.5 font-medium">{t('workspace.phase2StagingColAssignee')}</th>
                <th className="px-2 py-1.5 font-medium">{t('workspace.phase2StagingColStart')}</th>
                <th className="px-2 py-1.5 font-medium">{t('workspace.phase2StagingColColumn')}</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row) => (
                <tr key={row.localId || row.externalKey} className="border-b border-border/60">
                  <td className="px-2 py-1.5 font-mono">{row.externalKey || '—'}</td>
                  <td className="px-2 py-1.5">{row.title || t('workspace.phase2StagingUntitled')}</td>
                  <td className="px-2 py-1.5">{row.estimateHours ?? '—'}</td>
                  <td className="px-2 py-1.5">{personLabel(row, unassigned)}</td>
                  <td className="px-2 py-1.5">{row.startDate || '—'}</td>
                  <td className="px-2 py-1.5">{row.columnHint || 'Backlog'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > REVIEW_PAGE_SIZE ? (
            <div className="flex items-center justify-end gap-2 border-t border-border px-2 py-1.5 text-muted-foreground">
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
                  to: Math.min(pageStart + REVIEW_PAGE_SIZE, rows.length),
                  total: rows.length,
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
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">{t('workspace.phase2PoReviewEmpty')}</p>
      )}

      {canDecide ? (
        <>
          <label className="mt-3 block text-sm">
            <span className="text-xs font-medium text-muted-foreground">
              {t('workspace.phase2PoReviewChangeLabel')}
            </span>
            <textarea
              className="mt-1 min-h-[4.5rem] w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={busy}
              placeholder={t('workspace.phase2PoReviewChangeRequired')}
            />
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
              disabled={busy}
              onClick={() => onDecide('approve_staging')}
            >
              {t('workspace.phase2PoApprove')}
            </button>
            <button
              type="button"
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
              disabled={busy || !changeNote}
              onClick={() => onDecide('request_changes')}
            >
              {t('workspace.phase2PoRequestChanges')}
            </button>
          </div>
        </>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">
          {isSubmitter ? t('workspace.phase2PoSodBlocked') : t('workspace.phase2PoNeedRole')}
        </p>
      )}
    </div>
  );
}
