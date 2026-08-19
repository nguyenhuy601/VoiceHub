import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  AdminUserFormCard,
  AdminUserPanelShell,
  adminPrimaryBtnClass,
  adminSecondaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
import CatalogKeyLabelEditor from '../projects/hub/CatalogKeyLabelEditor';
import { normalizePriorityConfig } from '../projects/hub/projectPriorityConfig';
import {
  filterTransitionsByStateKeys,
  mergeEditorItemsToStates,
  statesToEditorItems,
} from '../projects/hub/workflowStatusEditor';
import projectAPI from '../../services/api/projectAPI';
import { taskAPI, unwrapTaskApiPayload } from '../../services/api/taskAPI';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import AdminTaskBoardPicker from './AdminTaskBoardPicker';

function unwrap(res) {
  return unwrapTaskApiPayload(res) ?? res?.data?.data ?? res?.data ?? res;
}

function unwrapProject(res) {
  return res?.data?.data ?? res?.data ?? res;
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
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);

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
      return;
    }
    setLoading(true);
    try {
      const res = await taskAPI.getBoardWorkflow(boardId, { organizationId: orgId });
      const wf = unwrap(res);
      const doc = wf && typeof wf === 'object' ? wf : null;
      setWorkflowDoc(doc);
      setWorkflowStates(Array.isArray(doc?.states) ? doc.states.map((s) => ({ ...s })) : []);
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminTasks.workflowLoadFail') }));
      setWorkflowDoc(null);
      setWorkflowStates([]);
    } finally {
      setLoading(false);
    }
  }, [boardId, orgId, t]);

  useEffect(() => {
    void loadWorkflow();
  }, [loadWorkflow]);

  useEffect(() => {
    if (!projectId) {
      setPriorityItems(normalizePriorityConfig(null).items);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await projectAPI.get(projectId);
        const data = unwrapProject(res);
        if (cancelled) return;
        setPriorityItems(normalizePriorityConfig(data?.priorityConfig).items);
      } catch (error) {
        if (cancelled) return;
        toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminTasks.catalogSaveFail') }));
        setPriorityItems(normalizePriorityConfig(null).items);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, t]);

  const seed = async () => {
    if (!boardId || seeding) return;
    setSeeding(true);
    try {
      const res = await taskAPI.seedBoardWorkflow(boardId, { organizationId: orgId });
      const wf = unwrap(res);
      setWorkflowDoc(wf && typeof wf === 'object' ? wf : null);
      setWorkflowStates(Array.isArray(wf?.states) ? wf.states.map((s) => ({ ...s })) : []);
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
        const transitions = filterTransitionsByStateKeys(workflowDoc.transitions, workflowStates);
        const res = await taskAPI.putBoardWorkflow(
          boardId,
          {
            name: workflowDoc.name || 'Default',
            states: workflowStates,
            transitions,
            templateKey: workflowDoc.templateKey,
            templateId: workflowDoc.templateId,
          },
          { organizationId: orgId }
        );
        const saved = unwrap(res);
        if (saved && typeof saved === 'object') {
          setWorkflowDoc(saved);
          setWorkflowStates(Array.isArray(saved.states) ? saved.states.map((s) => ({ ...s })) : workflowStates);
        }
      }
      if (projectId) {
        await projectAPI.patch(projectId, { priorityConfig: { items: priorityItems } });
      }
      toast.success(t('adminTasks.catalogSaved'));
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminTasks.catalogSaveFail') }));
    } finally {
      setSaving(false);
    }
  };

  const statusItems = statesToEditorItems(workflowStates);
  const canSave = Boolean(boardId) && !saving && !seeding && (!workflowDoc || workflowStates.length > 0);

  return (
    <AdminUserPanelShell
      title={`${t('adminDomains.projects.status')} / ${t('adminDomains.projects.priority')}`}
      hint={t('adminTasks.statusPriorityHint')}
      actions={
        <button type="button" className={adminPrimaryBtnClass()} disabled={!canSave} onClick={() => void save()}>
          {saving ? t('adminTasks.loading') : t('adminTasks.catalogSave')}
        </button>
      }
    >
      <AdminTaskBoardPicker orgId={orgId} boardId={boardId} onBoardIdChange={setBoardId} onProjectIdChange={onProjectIdChange} />

      {!boardId ? (
        <p className="text-sm text-muted-foreground">{t('adminTasks.needBoard')}</p>
      ) : loading ? (
        <p className="text-sm text-muted-foreground">{t('adminTasks.loading')}</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <AdminUserFormCard title={t('adminTasks.statusList')} hint={t('adminTasks.catalogStatusHint')}>
            {workflowDoc ? (
              <CatalogKeyLabelEditor
                items={statusItems}
                disabled={saving}
                addKeyPh="blocked"
                addLabelPh="Blocked"
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
                  onClick={() => void seed()}
                >
                  {seeding ? t('adminTasks.loading') : t('adminTasks.workflowSeed')}
                </button>
              </div>
            )}
          </AdminUserFormCard>
          <AdminUserFormCard title={t('adminTasks.priorityList')} hint={t('adminTasks.catalogPriorityHint')}>
            <CatalogKeyLabelEditor
              items={priorityItems}
              disabled={saving || !projectId}
              addKeyPh="blocker"
              addLabelPh="Blocker"
              addText={t('adminTasks.catalogAddPriority')}
              deleteAria={t('adminTasks.catalogDelete')}
              onChange={setPriorityItems}
            />
          </AdminUserFormCard>
        </div>
      )}
    </AdminUserPanelShell>
  );
}
