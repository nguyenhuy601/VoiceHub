import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Download } from 'lucide-react';
import { analysisAPI } from '../../../../services/api/analysisAPI';
import { useAppStrings } from '../../../../locales/appStrings';
import { resolveApiErrorMessage } from '../../../../utils/resolveApiErrorMessage';
import useProjectCapabilities from '../hooks/useProjectCapabilities';
import { buildPhase1ModulePath } from '../nav/phase1NavConfig';
import { isSrsDraftEmpty } from './srsEmptyAudit';
import { kindChipClass, queueCardClass } from '../shared/phase1UiTokens';

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? res;
}

async function downloadBlobAsFile(blobLike, fileName, failMsg) {
  const blob =
    blobLike instanceof Blob
      ? blobLike
      : new Blob([blobLike?.data ?? blobLike], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });
  if (blob.type && blob.type.includes('application/json')) {
    const text = await blob.text();
    let msg = failMsg;
    try {
      const parsed = JSON.parse(text);
      msg = parsed.message || msg;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

/** working = approved live set for next cut; baselines = frozen release vers. */
const TAB_LABEL_KEYS = {
  working: 'workspace.phase1TabSrsWorking',
  baselines: 'workspace.phase1TabBaselines',
};

const SECTION_ORDER = [
  'SCOPE',
  'BG',
  'BR',
  'BPM',
  'FR',
  'UC',
  'NFR',
  'INTERFACE',
  'DATA',
  'GLOSSARY',
  'ASSUMPTION',
];

export default function SrsPage({ projectId, readOnly = false }) {
  const { t } = useAppStrings();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { capabilities } = useProjectCapabilities(projectId);
  const [tab, setTab] = useState('working');
  const [didAutoSelectTab, setDidAutoSelectTab] = useState(false);
  const [version, setVersion] = useState('');
  const [expandedBaselineId, setExpandedBaselineId] = useState('');

  const { data: draft, isLoading: draftLoading } = useQuery({
    queryKey: ['srsDraft', projectId],
    queryFn: async () => unwrap(await analysisAPI.getSrsDraft(projectId)),
    enabled: Boolean(projectId) && tab !== 'baselines',
  });

  const { data: baselines = [], isFetched: baselinesFetched } = useQuery({
    queryKey: ['srsBaselines', projectId],
    queryFn: async () => {
      const raw = unwrap(await analysisAPI.listSrsBaselines(projectId));
      return Array.isArray(raw) ? raw : [];
    },
    enabled: Boolean(projectId),
  });

  // After ≥1 cut: land on baselines (once). No prior cut → stay on working set.
  useEffect(() => {
    if (didAutoSelectTab || !baselinesFetched) return;
    if (baselines.length > 0) {
      setTab('baselines');
      const firstId = String(baselines[0]?.id || baselines[0]?._id || '');
      if (firstId) setExpandedBaselineId(firstId);
    }
    setDidAutoSelectTab(true);
  }, [baselinesFetched, baselines, didAutoSelectTab]);

  const hasBaselines = baselines.length > 0;
  const latestVersion = hasBaselines
    ? String(baselines[0]?.srsVersion || baselines[baselines.length - 1]?.srsVersion || '').trim()
    : '';

  const cutMut = useMutation({
    mutationFn: () => {
      const n = baselines.length + 1;
      return analysisAPI.cutSrsBaseline(projectId, {
        srsVersion: version.trim() || `v${n}`,
        title: t('workspace.phase1SrsBaselineTitle', { n }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['srsBaselines', projectId] });
      queryClient.invalidateQueries({ queryKey: ['projectAnalysisGaps', String(projectId)] });
      toast.success(t('workspace.phase1SrsCut'));
      setTab('baselines');
      setDidAutoSelectTab(true);
      setVersion('');
    },
    onError: (err) => toast.error(resolveApiErrorMessage(err)),
  });

  const exportMut = useMutation({
    mutationFn: async ({ baselineId, srsVersion } = {}) => {
      const res = await analysisAPI.downloadSrsWorkbook(projectId, { baselineId, srsVersion });
      const name = baselineId
        ? `SRS_${String(srsVersion || 'baseline').replace(/[^\w.-]+/g, '_')}.xlsx`
        : 'SRS_working.xlsx';
      await downloadBlobAsFile(res, name, t('workspace.phase1SrsExportFail'));
    },
    onSuccess: () => toast.success(t('workspace.phase1SrsExportOk')),
    onError: (err) => toast.error(resolveApiErrorMessage(err)),
  });

  const sections = draft?.sections || {};
  const approvedCount = Number(draft?.artifactCount || 0);
  const sectionEntries = useMemo(() => {
    const keys = SECTION_ORDER.filter((k) => k in sections);
    for (const k of Object.keys(sections)) {
      if (!keys.includes(k)) keys.push(k);
    }
    return keys.map((kind) => [kind, sections[kind] || []]);
  }, [sections]);

  const isWorkingEmpty = tab !== 'baselines' && isSrsDraftEmpty(draft, { loading: draftLoading });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold">{t('workspace.phaseNavSrsBaselines')}</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">{t('workspace.phase1ReleaseVerIsSrsHint')}</p>
          {tab !== 'baselines' ? (
            <p className="mt-0.5 text-xs text-muted-foreground">{t('workspace.phase1SrsDraftHint')}</p>
          ) : (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t('workspace.phase1SrsBaselinesReleaseHint')}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-xs font-medium disabled:opacity-50"
            disabled={exportMut.isPending || (tab !== 'baselines' && approvedCount === 0)}
            onClick={() => {
              if (tab === 'baselines' && baselines[0]) {
                exportMut.mutate({
                  baselineId: String(baselines[0].id || baselines[0]._id),
                  srsVersion: baselines[0].srsVersion,
                });
              } else {
                exportMut.mutate({});
              }
            }}
          >
            <Download size={12} />
            {exportMut.isPending ? t('common.loading') : t('workspace.phase1SrsExport')}
          </button>
          <div className="flex gap-1 rounded-lg border border-border p-0.5">
            {['working', 'baselines'].map((k) => (
              <button
                key={k}
                type="button"
                className={`rounded-md px-3 py-1 text-xs font-medium ${tab === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
                onClick={() => setTab(k)}
              >
                {t(TAB_LABEL_KEYS[k])}
              </button>
            ))}
          </div>
        </div>
      </div>

      {hasBaselines ? (
        <p className="rounded-md border border-border/80 bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
          {t('workspace.phase1SrsAfterCutBanner', {
            version: latestVersion || String(baselines.length),
          })}
        </p>
      ) : null}

      {tab === 'baselines' ? (
        <div className="space-y-3">
          {!baselines.length ? (
            <p className="rounded-xl border border-dashed border-border/60 px-4 py-10 text-center text-sm text-muted-foreground">
              {t('workspace.phase1NoSrsBaseline')}
            </p>
          ) : null}
          {baselines.map((b, idx) => {
            const id = String(b.id || b._id || idx);
            const snap = Array.isArray(b.artifactSnapshot) ? b.artifactSnapshot : [];
            const rowsByKind = {};
            for (const row of snap) {
              const k = String(row.kind || 'OTHER').toUpperCase();
              if (!rowsByKind[k]) rowsByKind[k] = [];
              rowsByKind[k].push(row);
            }
            const kindKeys = SECTION_ORDER.filter((k) => rowsByKind[k]?.length);
            for (const k of Object.keys(rowsByKind)) {
              if (!kindKeys.includes(k)) kindKeys.push(k);
            }
            const open = expandedBaselineId === id;
            return (
              <article
                key={id}
                className={`rounded-xl border p-4 ${queueCardClass(
                  idx === 0 ? 'approved' : 'draft'
                )}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => setExpandedBaselineId(open ? '' : id)}
                    aria-expanded={open}
                  >
                    <p className="font-mono text-xs font-semibold text-primary">
                      {b.srsVersion || '—'}
                      {idx === 0 ? (
                        <span className="ml-2 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
                          {t('workspace.phase1SrsLatestBadge')}
                        </span>
                      ) : null}
                    </p>
                    <h2 className="mt-1 text-sm font-semibold text-foreground">
                      {b.title || t('workspace.phase1SrsBaselineDefault')}
                    </h2>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {t('workspace.phase1Items')}: {snap.length}
                      {b.approvedAt
                        ? ` · ${new Date(b.approvedAt).toLocaleString()}`
                        : ''}
                    </p>
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-xs font-medium disabled:opacity-50"
                    disabled={exportMut.isPending}
                    onClick={() =>
                      exportMut.mutate({
                        baselineId: id,
                        srsVersion: b.srsVersion,
                      })
                    }
                  >
                    <Download size={12} />
                    {t('workspace.phase1SrsExport')}
                  </button>
                </div>
                {open ? (
                  <div className="mt-3 border-t border-border/50 pt-3">
                    <p className="mb-2 text-[11px] font-semibold uppercase text-muted-foreground">
                      {t('workspace.phase1SrsSnapshotSummary')}
                    </p>
                    {!kindKeys.length ? (
                      <p className="text-xs text-muted-foreground">
                        {t('workspace.phase1SrsSnapshotEmpty')}
                      </p>
                    ) : (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {kindKeys.map((kind) => {
                          const rows = rowsByKind[kind] || [];
                          return (
                            <div
                              key={`${id}-${kind}`}
                              className={`rounded-lg border p-3 ${queueCardClass('approved')}`}
                            >
                              <h3 className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                                <span className={kindChipClass(kind)}>{kind}</span>
                                <span className="text-muted-foreground">({rows.length})</span>
                              </h3>
                              <ul className="mt-2 max-h-36 space-y-1 overflow-y-auto text-xs">
                                {rows.map((r) => (
                                  <li
                                    key={`${kind}-${r.externalKey}-${r.version}-${r.artifactId || ''}`}
                                    className="truncate"
                                    title={r.title || ''}
                                  >
                                    <span className="font-mono text-[10px] text-muted-foreground">
                                      {r.externalKey}
                                    </span>{' '}
                                    {r.title}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    {t('workspace.phase1SrsCardExpandHint')}
                  </p>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <>
          {draftLoading ? <p className="text-sm text-muted-foreground">{t('common.loading')}</p> : null}

          {isWorkingEmpty ? (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-6 text-sm">
              <h2 className="text-base font-semibold text-foreground">
                {t('workspace.phase1SrsEmptyTitle')}
              </h2>
              <p className="mt-2 text-muted-foreground">{t('workspace.phase1SrsEmptyBody')}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                {t('workspace.phase1SrsEmptyNotBroken')}
              </p>
              <button
                type="button"
                className="mt-4 rounded-lg border border-border bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted/50"
                onClick={() => navigate(buildPhase1ModulePath(projectId, 'analysis-reviews'))}
              >
                {t('workspace.phase1SrsGoApprove')}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {!draftLoading && approvedCount > 0 ? (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">
                    {t('workspace.phase1SrsApprovedCount', { count: approvedCount })}
                  </p>
                </div>
              ) : null}

              {/* Cut CTA ở đầu — tránh phải cuộn hết list mới thấy nút */}
              {capabilities.canCutSrs && !readOnly ? (
                <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 p-3 shadow-sm backdrop-blur-sm">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">
                      {hasBaselines
                        ? t('workspace.phase1SrsCutNextHint')
                        : t('workspace.phase1SrsCutCreatesReleaseVer')}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {t('workspace.phase1SrsDraftVerIsNotStatus')}
                    </p>
                  </div>
                  <input
                    className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
                    placeholder={t('workspace.phase1SrsVersionPlaceholder')}
                    value={version}
                    onChange={(e) => setVersion(e.target.value)}
                    aria-label={t('workspace.phase1SrsVersionPlaceholder')}
                  />
                  <button
                    type="button"
                    className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                    disabled={cutMut.isPending || approvedCount === 0}
                    onClick={() => cutMut.mutate()}
                  >
                    {cutMut.isPending
                      ? t('common.loading')
                      : hasBaselines
                        ? t('workspace.phase1CutSrsNext')
                        : t('workspace.phase1CutSrs')}
                  </button>
                </div>
              ) : !capabilities.canCutSrs && !readOnly ? (
                <p className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                  {t('workspace.phase1SrsNoCutPerm')}
                </p>
              ) : null}

              {sectionEntries.map(([kind, rows]) => (
                <div
                  key={kind}
                  className={`rounded-xl border p-4 ${queueCardClass(
                    rows?.length ? 'approved' : 'draft'
                  )}`}
                >
                  <h2 className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                    <span className={kindChipClass(kind)}>{kind}</span>
                    <span className="text-muted-foreground">({(rows || []).length})</span>
                  </h2>
                  <ul className="mt-2 space-y-1 text-sm">
                    {(rows || []).map((r) => (
                      <li key={r.id}>
                        <span className="font-mono text-xs">{r.externalKey}</span> {r.title}
                        {r.version != null ? (
                          <span className="ml-1 text-[11px] text-muted-foreground">
                            {t('workspace.phase1SrsDraftArtifactVer', { version: r.version })}
                          </span>
                        ) : null}
                      </li>
                    ))}
                    {!rows?.length ? (
                      <li className="text-muted-foreground">
                        {t('workspace.phase1SrsEmptySection', { kind })}
                      </li>
                    ) : null}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
