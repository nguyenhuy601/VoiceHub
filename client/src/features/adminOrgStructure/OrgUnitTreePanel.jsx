/** Huy: Cây Organizational Unit động — tạo / sửa / xóa / chuyển parent */
import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  AdminUserFormCard,
  AdminUserPanelShell,
  adminDangerBtnClass,
  adminInputClass,
  adminLabelClass,
  adminPrimaryBtnClass,
  adminSecondaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
import {
  AdminBusySpinner,
  AdminEmptyState,
  AdminListSkeleton,
  AdminLoadErrorState,
} from '../../components/adminUsers/adminPanelStates';
import ConfirmDialog from '../../components/Shared/ConfirmDialog';
import { organizationAPI } from '../../services/api/organizationAPI';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { unitId, unitName, unwrapOrgApi } from '../../utils/adminOrgStructureUtils';
import useOrgStructureLevels from '../../hooks/useOrgStructureLevels';

function flattenTree(nodes, depth = 0, acc = []) {
  for (const n of nodes || []) {
    acc.push({ ...n, _depth: depth });
    if (n.children?.length) flattenTree(n.children, depth + 1, acc);
  }
  return acc;
}

export default function OrgUnitTreePanel({ orgId }) {
  const { t } = useAppStrings();
  const [tree, setTree] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [createMode, setCreateMode] = useState(false);
  const [loadingUnits, setLoadingUnits] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [form, setForm] = useState({
    name: '',
    levelKey: '',
    unitKind: 'custom',
    description: '',
    parentUnitId: '',
  });

  const { levels, loading: levelsLoading, reload: reloadLevels } = useOrgStructureLevels(orgId);

  const flat = useMemo(() => flattenTree(tree), [tree]);
  const selected = useMemo(
    () => flat.find((u) => unitId(u) === selectedId) || null,
    [flat, selectedId]
  );
  const showForm = Boolean(selectedId) || createMode;

  const loadUnits = useCallback(async () => {
    if (!orgId) return;
    setLoadingUnits(true);
    setLoadError('');
    try {
      const unitsRes = await organizationAPI.listStructureUnits(orgId);
      const unitsData = unwrapOrgApi(unitsRes);
      setTree(Array.isArray(unitsData?.unitsTree) ? unitsData.unitsTree : []);
    } catch (error) {
      const msg = resolveApiErrorMessage(error, { t, fallback: t('adminOrg.loadFail') });
      toast.error(msg);
      setLoadError(msg);
      setTree([]);
    } finally {
      setLoadingUnits(false);
    }
  }, [orgId, t]);

  const load = useCallback(async () => {
    await Promise.all([loadUnits(), reloadLevels()]);
  }, [loadUnits, reloadLevels]);

  useEffect(() => {
    loadUnits();
  }, [loadUnits]);

  const loading = loadingUnits || levelsLoading;

  useEffect(() => {
    if (createMode) {
      setForm({
        name: '',
        levelKey: levels[0]?.key || '',
        unitKind: 'custom',
        description: '',
        parentUnitId: selectedId || '',
      });
      return;
    }
    if (!selected) return;
    setForm({
      name: selected.name || '',
      levelKey: selected.levelKey || '',
      unitKind: selected.unitKind || 'custom',
      description: selected.description || '',
      parentUnitId: selected.parentUnitId ? String(selected.parentUnitId) : '',
    });
  }, [selected, createMode, selectedId, levels]);

  useEffect(() => {
    if (form.levelKey || !levels[0]) return;
    setForm((f) => ({ ...f, levelKey: levels[0].key }));
  }, [levels, form.levelKey]);

  const selectUnit = (id) => {
    setCreateMode(false);
    setSelectedId(id);
  };

  const startCreateChild = () => {
    if (!selectedId) return;
    setCreateMode(true);
  };

  const createUnit = async (e) => {
    e.preventDefault();
    if (!orgId || saving) return;
    const name = String(form.name || '').trim();
    if (!name || !form.levelKey) {
      toast.error(t('adminOrg.unitCreateValidation'));
      return;
    }
    setSaving(true);
    try {
      await organizationAPI.createStructureUnit(orgId, {
        name,
        levelKey: form.levelKey,
        unitKind: form.unitKind,
        description: form.description,
        parentUnitId: form.parentUnitId || null,
      });
      toast.success(t('adminOrg.created'));
      setCreateMode(false);
      await load();
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminOrg.createFail') }));
    } finally {
      setSaving(false);
    }
  };

  const saveSelected = async () => {
    if (!orgId || !selectedId || saving || createMode) return;
    setSaving(true);
    try {
      await organizationAPI.updateStructureUnit(orgId, selectedId, {
        name: form.name,
        description: form.description,
        unitKind: form.unitKind,
        levelKey: form.levelKey,
        parentUnitId: form.parentUnitId || null,
      });
      toast.success(t('adminOrg.saved'));
      await load();
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminOrg.saveFail') }));
    } finally {
      setSaving(false);
    }
  };

  const archiveSelected = async () => {
    if (!orgId || !selectedId || saving || createMode) return;
    setSaving(true);
    try {
      await organizationAPI.deleteStructureUnit(orgId, selectedId);
      toast.success(t('adminOrg.deleted'));
      setSelectedId('');
      setCreateMode(false);
      await load();
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminOrg.deleteFail') }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminUserPanelShell title={t('adminDomains.orgStructure.unitTree')} hint={t('adminOrg.unitTreeHint')} wide>
      {loadError ? (
        <AdminLoadErrorState message={loadError} onRetry={() => load()} disabled={loading} />
      ) : (
        <div
          className={`grid gap-4 lg:items-start ${
            showForm ? 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]' : 'lg:grid-cols-1'
          }`}
        >
          <AdminUserFormCard title={t('adminOrg.unitTreeTitle')}>
            {loading && !flat.length ? (
              <AdminListSkeleton />
            ) : (
              <>
                <ul className="max-h-[480px] space-y-0.5 overflow-auto" aria-busy={loading || undefined}>
                  {flat.map((u) => {
                    const id = unitId(u);
                    const active = id === selectedId && !createMode;
                    return (
                      <li key={id}>
                        <button
                          type="button"
                          onClick={() => selectUnit(id)}
                          aria-current={active ? 'true' : undefined}
                          className={`flex w-full items-center rounded-lg px-2 py-2 text-left text-sm transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none ${
                            active ? 'bg-primary-subtle font-semibold text-foreground' : 'hover:bg-muted'
                          }`}
                          style={{ paddingLeft: 8 + (u._depth || 0) * 16 }}
                        >
                          <span className="truncate">{unitName(u)}</span>
                          <span className="ml-auto shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                            {u.levelKey}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                {!flat.length ? <AdminEmptyState message={t('adminOrg.emptyList')} /> : null}
                {!flat.length && !createMode ? (
                  <div className="mt-3">
                    <button
                      type="button"
                      className={adminPrimaryBtnClass()}
                      onClick={() => {
                        setSelectedId('');
                        setCreateMode(true);
                      }}
                    >
                      {t('adminOrg.createUnit')}
                    </button>
                  </div>
                ) : null}
              </>
            )}
          </AdminUserFormCard>

          {showForm ? (
            <div className="space-y-4">
              <AdminUserFormCard title={createMode ? t('adminOrg.createUnit') : t('adminOrg.editUnit')}>
                <form
                  className="space-y-3"
                  onSubmit={createMode ? createUnit : (e) => { e.preventDefault(); saveSelected(); }}
                >
                  <label className="block">
                    <span className={adminLabelClass()}>{t('adminOrg.name')}</span>
                    <input
                      className={adminInputClass()}
                      maxLength={120}
                      required
                      value={form.name}
                      onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    />
                  </label>
                  <label className="block">
                    <span className={adminLabelClass()}>{t('adminOrg.levelKey')}</span>
                    <select
                      className={adminInputClass()}
                      value={form.levelKey}
                      onChange={(e) => setForm((f) => ({ ...f, levelKey: e.target.value }))}
                    >
                      {levels.map((l) => (
                        <option key={l.key} value={l.key}>
                          {l.label} ({l.key})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className={adminLabelClass()}>{t('adminOrg.parentUnit')}</span>
                    <select
                      className={adminInputClass()}
                      value={form.parentUnitId}
                      onChange={(e) => setForm((f) => ({ ...f, parentUnitId: e.target.value }))}
                    >
                      <option value="">{t('adminOrg.noParent')}</option>
                      {flat
                        .filter((u) => unitId(u) !== selectedId || createMode)
                        .map((u) => (
                          <option key={unitId(u)} value={unitId(u)}>
                            {'—'.repeat(u._depth || 0)} {unitName(u)}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className={adminLabelClass()}>{t('adminOrg.description')}</span>
                    <textarea
                      rows={2}
                      maxLength={1000}
                      className={adminInputClass()}
                      value={form.description}
                      onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="submit"
                      disabled={saving}
                      aria-busy={saving || undefined}
                      className={adminPrimaryBtnClass()}
                    >
                      <AdminBusySpinner busy={saving} />
                      {saving
                        ? t('common.saving')
                        : createMode
                          ? t('adminOrg.createUnit')
                          : t('common.save')}
                    </button>
                    {!createMode && selected ? (
                      <>
                        <button type="button" className={adminSecondaryBtnClass()} onClick={startCreateChild}>
                          {t('adminOrg.newUnit')}
                        </button>
                        <button
                          type="button"
                          className={adminDangerBtnClass()}
                          disabled={saving}
                          onClick={() => setConfirmArchive(true)}
                        >
                          {t('adminOrg.archiveUnit')}
                        </button>
                      </>
                    ) : null}
                    {createMode ? (
                      <button
                        type="button"
                        className={adminSecondaryBtnClass()}
                        onClick={() => setCreateMode(false)}
                      >
                        {t('common.cancel')}
                      </button>
                    ) : null}
                  </div>
                </form>
              </AdminUserFormCard>
            </div>
          ) : null}
        </div>
      )}
      <ConfirmDialog
        isOpen={confirmArchive}
        onClose={() => setConfirmArchive(false)}
        onConfirm={archiveSelected}
        variant="danger"
        title={t('adminOrg.unitDisableConfirmTitle', { action: t('adminOrg.archiveUnit'), name: unitName(selected) })}
        message={t('adminOrg.unitArchiveConfirmMessage', { name: unitName(selected) })}
        confirmText={t('adminOrg.archiveUnit')}
        cancelText={t('common.cancel')}
      />
    </AdminUserPanelShell>
  );
}
