import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileText } from 'lucide-react';
import { analysisAPI } from '../../../../services/api/analysisAPI';
import { requirementAPI } from '../../../../services/api/requirementAPI';
import { useAppStrings } from '../../../../locales/appStrings';

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? res;
}

/**
 * AI mode — Customer Documents tab shows only filenames used for AI analysis (read-only).
 */
export default function AiCustomerDocumentsPanel({
  projectId,
  organizationId,
  packId: packIdProp,
}) {
  const { t } = useAppStrings();
  const [boundPackId, setBoundPackId] = useState(() => String(packIdProp || '').trim());

  useEffect(() => {
    if (packIdProp) {
      setBoundPackId(String(packIdProp).trim());
      return;
    }
    if (!organizationId || !projectId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await requirementAPI.listPacks(organizationId, {});
        const data = unwrap(res);
        const list = Array.isArray(data) ? data : data?.items || data?.packs || [];
        const hit = list.find((p) => String(p.projectId || '') === String(projectId));
        if (!cancelled && hit?._id) setBoundPackId(String(hit._id));
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [organizationId, projectId, packIdProp]);

  const { data: fromPack = [], isLoading: loadingPack } = useQuery({
    queryKey: ['packCustomerDocuments', organizationId, boundPackId],
    queryFn: async () => {
      const raw = unwrap(
        await requirementAPI.listPackCustomerDocuments(organizationId, boundPackId)
      );
      return Array.isArray(raw) ? raw : raw?.items || [];
    },
    enabled: Boolean(organizationId && boundPackId),
  });

  const { data: fromProject = [], isLoading: loadingProject } = useQuery({
    queryKey: ['customerDocuments', projectId],
    queryFn: async () => {
      const raw = unwrap(await analysisAPI.listCustomerDocuments(projectId));
      return Array.isArray(raw) ? raw : raw?.items || [];
    },
    enabled: Boolean(projectId),
  });

  const { data: packFull } = useQuery({
    queryKey: ['requirementPackAiDocs', organizationId, boundPackId],
    queryFn: async () =>
      unwrap(await requirementAPI.getPack(organizationId, boundPackId, { view: 'full' })),
    enabled: Boolean(organizationId && boundPackId),
  });

  const inputNames = useMemo(() => {
    const snap = Array.isArray(packFull?.aiAnalysis?.inputDocuments)
      ? packFull.aiAnalysis.inputDocuments
      : [];
    return new Set(snap.map((d) => String(d.filename || '').trim()).filter(Boolean));
  }, [packFull]);

  const rows = useMemo(() => {
    const byName = new Map();
    for (const doc of [...fromPack, ...fromProject]) {
      const filename = String(doc.filename || doc.name || '').trim();
      if (!filename) continue;
      if (!byName.has(filename)) {
        byName.set(filename, {
          filename,
          docClass: doc.docClass || '',
          usedForAi: inputNames.size ? inputNames.has(filename) : true,
        });
      }
    }
    // Prefer snapshot filenames when docs list empty but WHAT already recorded inputDocuments
    if (!byName.size && inputNames.size) {
      for (const filename of inputNames) {
        byName.set(filename, { filename, docClass: '', usedForAi: true });
      }
    }
    return [...byName.values()].sort((a, b) => a.filename.localeCompare(b.filename));
  }, [fromPack, fromProject, inputNames]);

  const loading = loadingPack || loadingProject;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3 sm:p-4">
      <div>
        <h1 className="text-base font-semibold">
          {t('workspace.phaseNavCustomerDocuments')}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('workspace.phase1AiDocsHint') ||
            'Chỉ hiển thị tên file đã dùng cho AI phân tích (mode AI).'}
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      ) : null}

      {!loading && !rows.length ? (
        <p className="text-sm text-muted-foreground">
          {t('workspace.phase1NoDocs') || 'Chưa có tài liệu khách hàng.'}
        </p>
      ) : null}

      <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
        {rows.map((row) => (
          <li
            key={row.filename}
            className="flex items-center gap-2 px-3 py-2.5 text-sm text-foreground"
          >
            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="min-w-0 flex-1 truncate" title={row.filename}>
              {row.filename}
            </span>
            {row.usedForAi ? (
              <span className="shrink-0 rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800 dark:text-emerald-200">
                {t('workspace.phase1AiDocsUsedBadge') || 'Đã dùng AI'}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
