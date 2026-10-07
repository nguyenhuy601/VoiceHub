import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  AdminUserFormCard,
  AdminUserPanelShell,
  adminPrimaryBtnClass,
  adminSecondaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
import {
  AdminBusySpinner,
  AdminListSkeleton,
  AdminLoadErrorState,
} from '../../components/adminUsers/adminPanelStates';
import { ConfirmDialog } from '../../components/Shared';
import CatalogKeyLabelEditor from '../projects/hub/CatalogKeyLabelEditor';
import { normalizePriorityConfig } from '../projects/hub/projectPriorityConfig';
import {
  ensureAdjacentTransitions,
  ensureReopenFromDone,
  filterTransitionsByStateKeys,
  mergeEditorItemsToStates,
  statesToEditorItems,
} from '../projects/hub/workflowStatusEditor';
import projectAPI from '../../services/api/projectAPI';
import { taskAPI, unwrapTaskApiPayload } from '../../services/api/taskAPI';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { repairUtf8Mojibake } from '../../utils/utf8Mojibake';
import AdminTaskBoardPicker from './AdminTaskBoardPicker';

function unwrap(res) {
  return unwrapTaskApiPayload(res) ?? res?.data?.data ?? res?.data ?? res;
}

function unwrapProject(res) {
  return res?.data?.data ?? res?.data ?? res;
}

function snapshotItems(items) {
  return JSON.stringify(Array.isArray(items) ? items : []);
}

/**
 * Admin Status / Priority — Status = board workflow states; Priority = project.priorityConfig.
 */
export default function TasksStatusPriorityPanel({ orgId }) {
  const { t } = useAppStrings();
  const [params, setParams] = useSearchParams();
  const boardId = String(params.get('boardId') || '').trim();
  const [projectId, setProjectId] = useState('');
  const [workflowDoc, setWorkflowDoc] = useState(null);
  const [workflowStates, setWorkflowStates] = useState([]);
  const [priorityItems, setPriorityItems] = useState(() => normalizePriorityConfig(null).items);
  const [savedWorkflowSnap, setSavedWorkflowSnap] = useState('[]');
  const [savedPrioritySnap, setSavedPrioritySnap] = useState(() =>
    snapshotItems(normalizePriorityConfig(null).items)
  );
  const [loading, setLoading] = useState(false);
  const [workflowLoadError, setWorkflowLoadError] = useState('');
  const [priorityLoadError, setPriorityLoadError] = useState('');
  const [priorityLoading, setPriorityLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [confirmSeed, setConfirmSeed] = useState(false);

  const setBoardId = (id) => {
    const next = new URLSearchParams(params);
    if (id) next.set('boardId', id);
    else next.delete('boardId');
    setParams(next, { replace: true });
  };

  const onProjectIdChange = useCallback((id) => {
    setProjectId(String(id || '').trim());
  }, []);

  const loadWorkflow = useCallback(async () => {
    if (!boardId) {
      setWorkflowDoc(null);
      setWorkflowStates([]);
      setSavedWorkflowSnap('[]');
      setWorkflowLoadError('');
      return;
    }
    setLoading(true);
    setWorkflowLoadError('');
    try {
      const res = await taskAPI.getBoardWorkflow(boardId, { organizationId: orgId });
      const wf = unwrap(res);
      const doc = wf && typeof wf === 'object' ? wf : null;
      const states = Array.isArray(doc?.states) ? doc.states.map((s) => ({ ...s })) : [];
      setWorkflowDoc(doc);
      setWorkflowStates(states);
      setSavedWorkflowSnap(snapshotItems(statesToEditorItems(states)));
    } catch (error) {
      setWorkflowLoadError(
        resolveApiErrorMessage(error, { t, fallback: t('adminTasks.workflowLoadFail') })
      );
      setWorkflowDoc(null);
      setWorkflowStates([]);
      setSavedWorkflowSnap('[]');
    } finally {
      setLoading(false);
    }
  }, [boardId, orgId, t]);

  useEffect(() => {
    void loadWorkflow();
  }, [loadWorkflow]);

  const loadPriority = useCallback(async () => {
    if (!projectId) {
      const defaults = normalizePriorityConfig(null).items;
      setPriorityItems(defaults);
      setSavedPrioritySnap(snapshotItems(defaults));
      setPriorityLoadError('');
      setPriorityLoading(false);
      return;
    }
    setPriorityLoading(true);
    setPriorityLoadError('');
    try {
      const res = await projectAPI.get(projectId);
      const data = unwrapProject(res);
      const items = normalizePriorityConfig(data?.priorityConfig).items;
      setPriorityItems(items);
      setSavedPrioritySnap(snapshotItems(items));
    } catch (error) {
      setPriorityLoadError(
        resolveApiErrorMessage(error, { t, fallback: t('adminTasks.priorityLoadFail') })
      );
      const defaults = normalizePriorityConfig(null).items;
      setPriorityItems(defaults);
      setSavedPrioritySnap(snapshotItems(defaults));
    } finally {
      setPriorityLoading(false);
    }
  }, [projectId, t]);

  useEffect(() => {
    void loadPriority();
  }, [loadPriority]);

  const seed = async () => {
    if (!boardId || seeding) return;
    setSeeding(true);
    try {
      const res = await taskAPI.seedBoardWorkflow(boardId, { organizationId: orgId });
      const wf = unwrap(res);
      const doc = wf && typeof wf === 'object' ? wf : null;
      const states = Array.isArray(wf?.states) ? wf.states.map((s) => ({ ...s })) : [];
      setWorkflowDoc(doc);
      setWorkflowStates(states);
      setSavedWorkflowSnap(snapshotItems(statesToEditorItems(states)));
      setWorkflowLoadError('');
      toast.success(t('adminTasks.workflowSeeded'));
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminTasks.workflowSeedFail') }));
    } finally {
      setSeeding(false);
    }
  };

  const save = async () => {
    if (saving || !boardId) return;
    if (workflowDoc && !workflowStates.length) {
      toast.error(t('adminTasks.catalogNeedOneStatus'));
      return;
    }
    setSaving(true);
    try {
      if (workflowDoc && workflowStates.length) {
        const transitions = ensureReopenFromDone(
          ensureAdjacentTransitions(
            filterTransitionsByStateKeys(workflowDoc.transitions, workflowStates),
            workflowStates
          ),
          workflowStates
        );
        const res = await taskAPI.putBoardWorkflow(
          boardId,
          {
            name: workflowDoc.name || 'Default',
            states: workflowStates.map((s) => ({
              ...s,
              label: repairUtf8Mojibake(s?.label),
            })),
            transitions,
            templateKey: workflowDoc.templateKey,
            templateId: workflowDoc.templateId,
          },
          { organizationId: orgId }
        );
        const saved = unwrap(res);
        if (saved && typeof saved === 'object') {
          const states = Array.isArray(saved.states)
            ? saved.states.map((s) => ({ ...s }))
            : workflowStates;
          setWorkflowDoc(saved);
          setWorkflowStates(states);
          setSavedWorkflowSnap(snapshotItems(statesToEditorItems(states)));
        }
      }
      if (projectId && !priorityLoadError) {
        await projectAPI.patch(projectId, { priorityConfig: { items: priorityItems } });
        setSavedPrioritySnap(snapshotItems(priorityItems));
      }
      toast.success(t('adminTasks.catalogSaved'));
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminTasks.catalogSaveFail') }));
    } finally {
      setSaving(false);
    }
  };

  const statusItems = statesToEditorItems(workflowStates);
  const isDirty = useMemo(() => {
    const workflowDirty = snapshotItems(statusItems) !== savedWorkflowSnap;
    const priorityDirty = snapshotItems(priorityItems) !== savedPrioritySnap;
    return workflowDirty || priorityDirty;
  }, [statusItems, priorityItems, savedWorkflowSnap, savedPrioritySnap]);

  const canSave =
    Boolean(boardId) &&
    !saving &&
    !seeding &&
    !loading &&
    !workflowLoadError &&
    isDirty &&
    (!workflowDoc || workflowStates.length > 0);

  let body;
  if (!boardId) {
    body = <p className="text-sm text-muted-foreground">{t('adminTasks.needBoard')}</p>;
  } else if (loading) {
    body = <AdminListSkeleton rows={4} />;
  } else {
    body = (
      <div className="grid gap-4 md:grid-cols-2">
        <AdminUserFormCard
          title={t('adminTasks.statusList')}
          hint={
            workflowDoc
              ? `${t('adminTasks.catalogStatusHint')} ${t('adminTasks.statusUnsavedHint')}`
              : t('adminTasks.catalogStatusHint')
          }
        >
          {workflowLoadError ? (
            <AdminLoadErrorState
              message={workflowLoadError}
              onRetry={loadWorkflow}
              disabled={loading}
            />
          ) : workflowDoc ? (
            <CatalogKeyLabelEditor
              items={statusItems}
              disabled={saving}
              addKeyPh={t('adminTasks.statusAddKeyPh')}
              addLabelPh={t('adminTasks.statusAddLabelPh')}
              addText={t('adminTasks.workflowAddState')}
              deleteAria={t('adminTasks.catalogDelete')}
              onChange={(items) => setWorkflowStates((prev) => mergeEditorItemsToStates(items, prev))}
            />
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">{t('adminTasks.workflowEmpty')}</p>
              <button
                type="button"
                className={adminSecondaryBtnClass()}
                disabled={seeding}
                aria-busy={seeding}
                onClick={() => setConfirmSeed(true)}
              >
                <AdminBusySpinner busy={seeding} />
                {t('adminTasks.workflowSeed')}
              </button>
            </div>
          )}
        </AdminUserFormCard>
        <AdminUserFormCard title={t('adminTasks.priorityList')} hint={t('adminTasks.catalogPriorityHint')}>
          {priorityLoading ? (
            <AdminListSkeleton rows={3} />
          ) : priorityLoadError ? (
            <AdminLoadErrorState
              message={priorityLoadError}
              onRetry={loadPriority}
              disabled={priorityLoading}
            />
          ) : (
            <CatalogKeyLabelEditor
              items={priorityItems}
              disabled={saving || !projectId}
              addKeyPh={t('adminTasks.priorityAddKeyPh')}
              addLabelPh={t('adminTasks.priorityAddLabelPh')}
              addText={t('adminTasks.catalogAddPriority')}
              deleteAria={t('adminTasks.catalogDelete')}
              onChange={setPriorityItems}
            />
          )}
        </AdminUserFormCard>
      </div>
    );
  }

  return (
    <AdminUserPanelShell
      title={t('adminDomains.projects.statusPriority')}
      hint={t('adminTasks.statusPriorityHint')}
      actions={
        <button
          type="button"
          className={adminPrimaryBtnClass()}
          disabled={!canSave}
          aria-busy={saving}
          onClick={() => void save()}
        >
          <AdminBusySpinner busy={saving} />
          {t('adminTasks.catalogSave')}
        </button>
      }
    >
      <AdminTaskBoardPicker
        orgId={orgId}
        boardId={boardId}
        onBoardIdChange={setBoardId}
        onProjectIdChange={onProjectIdChange}
      />
      {body}

      <ConfirmDialog
        isOpen={confirmSeed}
        onClose={() => setConfirmSeed(false)}
        onConfirm={() => seed()}
        title={t('adminTasks.confirmTitle')}
        message={t('adminTasks.workflowSeedConfirm')}
        confirmText={t('adminTasks.workflowSeed')}
        cancelText={t('adminTasks.cancel')}
        variant="danger"
      />
    </AdminUserPanelShell>
  );
}
