import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AdminDenseMobileList,
  AdminDenseTableCard,
  AdminDenseTableScroll,
  AdminUserPanelShell,
  adminDenseRowClass,
  adminManageLinkClass,
} from '../../components/adminUsers/adminUserPanelUi';
import {
  AdminEmptyState,
  AdminListSkeleton,
  AdminLoadErrorState,
} from '../../components/adminUsers/adminPanelStates';
import { taskAPI, unwrapTaskApiPayload } from '../../services/api/taskAPI';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import AdminTaskBoardPicker from './AdminTaskBoardPicker';
import { aggregateBoardLabels } from './adminLabelsUtils';

const MANAGE_PATH = '/app/admin/projects/manage';

function manageLinkForLabel(boardId, label) {
  const params = new URLSearchParams({ boardId, tag: label });
  return `${MANAGE_PATH}?${params.toString()}`;
}

/** Nhãn chỉ đọc: gom từ `card.tags` của board, mỗi nhãn mở Manage đã lọc sẵn. */
export default function TasksLabelsPanel({ orgId }) {
  const { t } = useAppStrings();
  const [params, setParams] = useSearchParams();
  const boardId = String(params.get('boardId') || '').trim();
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');

  const setBoardId = (id) => {
    const next = new URLSearchParams(params);
    if (id) next.set('boardId', id);
    else next.delete('boardId');
    setParams(next, { replace: true });
  };

  const load = useCallback(async () => {
    if (!boardId) {
      setCards([]);
      setLoadError('');
      return;
    }
    setLoading(true);
    setLoadError('');
    try {
      const res = await taskAPI.getBoardDetail(boardId, { organizationId: orgId });
      const data = unwrapTaskApiPayload(res);
      const list = Array.isArray(data?.cards) ? data.cards : Array.isArray(data?.tasks) ? data.tasks : [];
      setCards(list.filter((c) => c?.isActive !== false));
    } catch (error) {
      setLoadError(resolveApiErrorMessage(error, { t, fallback: t('adminTasks.manageLoadFail') }));
      setCards([]);
    } finally {
      setLoading(false);
    }
  }, [boardId, orgId, t]);

  useEffect(() => {
    load();
  }, [load]);

  const labels = useMemo(() => aggregateBoardLabels(cards), [cards]);

  const openLink = (row) => (
    <Link to={manageLinkForLabel(boardId, row.label)} className={adminManageLinkClass()}>
      {t('adminTasks.labelsOpenInManage')}
    </Link>
  );

  return (
    <AdminUserPanelShell title={t('adminDomains.projects.labels')} hint={t('adminTasks.labelsHint')}>
      <AdminTaskBoardPicker orgId={orgId} boardId={boardId} onBoardIdChange={setBoardId} />

      {!boardId ? (
        <p className="text-sm text-muted-foreground">{t('adminTasks.needBoard')}</p>
      ) : loading && !cards.length && !loadError ? (
        <AdminListSkeleton rows={5} />
      ) : loadError ? (
        <AdminLoadErrorState message={loadError} onRetry={load} disabled={loading} />
      ) : (
        <AdminDenseTableCard>
          <AdminDenseTableScroll>
            <AdminDenseMobileList
              items={labels}
              getKey={(row) => row.label.toLowerCase()}
              ariaLabel={t('adminDomains.projects.labels')}
              renderTitle={(row) => row.label}
              renderMeta={(row) => t('adminTasks.labelsCount', { n: row.count })}
              renderActions={openLink}
            />
            <table className="hidden min-w-full text-sm md:table">
              <thead className="sticky top-0 z-10 bg-muted text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">{t('adminTasks.labelsColLabel')}</th>
                  <th className="px-4 py-3">{t('adminTasks.labelsColCount')}</th>
                  <th className="px-4 py-3">{t('adminTasks.manageColActions')}</th>
                </tr>
              </thead>
              <tbody>
                {labels.map((row) => (
                  <tr key={row.label.toLowerCase()} className={adminDenseRowClass()}>
                    <td className="px-4 py-3 font-medium text-foreground">{row.label}</td>
                    <td className="px-4 py-3 text-muted-foreground">{row.count}</td>
                    <td className="px-4 py-3">{openLink(row)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!labels.length ? (
              <AdminEmptyState className="!py-10" message={t('adminTasks.labelsEmpty')} />
            ) : null}
          </AdminDenseTableScroll>
        </AdminDenseTableCard>
      )}
    </AdminUserPanelShell>
  );
}
