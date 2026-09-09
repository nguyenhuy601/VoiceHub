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
  const [loadingUnits, setLoadingUnits] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
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
    if (!selected) return;
    setForm({
      name: selected.name || '',
      levelKey: selected.levelKey || '',
      unitKind: selected.unitKind || 'custom',
      description: selected.description || '',
      parentUnitId: selected.parentUnitId ? String(selected.parentUnitId) : '',
    });
  }, [selected]);

  useEffect(() => {
    if (form.levelKey || !levels[0]) return;
    setForm((f) => ({ ...f, levelKey: levels[0].key }));
  }, [levels, form.levelKey]);

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
      setForm((f) => ({ ...f, name: '', description: '' }));
      await load();
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminOrg.createFail') }));
    } finally {
      setSaving(false);
    }
  };

  const saveSelected = async () => {
    if (!orgId || !selectedId || saving) return;
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
    if (!orgId || !selectedId || saving) return;
    setSaving(true);
    try {
      await organizationAPI.deleteStructureUnit(orgId, selectedId);
      toast.success(t('adminOrg.deleted'));
      setSelectedId('');
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
        <div className="space-y-3 rounded-xl border border-destructive/40 bg-destructive/5 px-3 py-4">
          <p className="text-sm text-destructive">{loadError}</p>
          <button type="button" className={adminPrimaryBtnClass()} onClick={() => load()}>
            {t('adminRbac.retry')}
          </button>
        </div>
      ) : (
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-start">
        <AdminUserFormCard title={t('adminOrg.unitTreeTitle')}>
          {loading ? (
            <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
          ) : (
            <ul className="max-h-[480px] space-y-0.5 overflow-auto">
              {flat.map((u) => {
                const id = unitId(u);
                const active = id === selectedId;
                return (
                  <li key={id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(id)}
                      className={`flex w-full items-center rounded-lg px-2 py-2 text-left text-sm transition ${
                        active ? 'bg-red-500/10 font-semibold' : 'hover:bg-muted/30'
                      }`}
                      style={{ paddingLeft: 8 + (u._depth || 0) * 16 }}
                    >
                      <span className="truncate">{unitName(u)}</span>
                      <span className="ml-auto shrink-0 rounded-full bg-muted/60 px-2 py-0.5 text-[10px] text-muted-foreground">
                        {u.levelKey}
                      </span>
                    </button>
                  </li>
                );
              })}
              {!flat.length ? (
                <p className="py-6 text-center text-sm text-muted-foreground">{t('adminOrg.emptyList')}</p>
              ) : null}
            </ul>
          )}
        </AdminUserFormCard>

        <div className="space-y-4">
          <AdminUserFormCard title={selected ? t('adminOrg.editUnit') : t('adminOrg.createUnit')}>
            <form className="space-y-3" onSubmit={selected ? (e) => { e.preventDefault(); saveSelected(); } : createUnit}>
              <label className="block">
                <span className={adminLabelClass()}>{t('adminOrg.name')}</span>
                <input
                  className={adminInputClass()}
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
                    .filter((u) => unitId(u) !== selectedId)
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
                  className={adminInputClass()}
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <button type="submit" disabled={saving} className={adminPrimaryBtnClass()}>
                  {saving ? t('common.saving') : selected ? t('common.save') : t('adminOrg.createUnit')}
                </button>
                {selected ? (
                  <>
                    <button type="button" className={adminSecondaryBtnClass()} onClick={() => setSelectedId('')}>
                      {t('adminOrg.newUnit')}
                    </button>
                    <button type="button" className={adminDangerBtnClass()} disabled={saving} onClick={archiveSelected}>
                      {t('adminOrg.archiveUnit')}
                    </button>
                  </>
                ) : null}
              </div>
            </form>
          </AdminUserFormCard>
        </div>
      </div>
      )}
    </AdminUserPanelShell>
  );
}
