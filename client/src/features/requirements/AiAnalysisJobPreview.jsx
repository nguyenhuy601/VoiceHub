/**
 * Structured preview for AI Analysis Blueprint wizard jobs (no raw JSON dump).
 */

import { buildRequirementFindingRows } from './aiAnalysisResultModel';

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function formatAttrs(attrs) {
  if (!Array.isArray(attrs) || !attrs.length) return '—';
  return attrs
    .map((a) => (typeof a === 'string' ? a : a?.name || a?.key || ''))
    .filter(Boolean)
    .join(', ');
}

function formatCrud(crud) {
  if (!crud) return '—';
  if (typeof crud === 'string') return crud;
  if (Array.isArray(crud)) return crud.join(', ');
  const keys = Object.keys(crud).filter((k) => crud[k]);
  return keys.length ? keys.join(', ') : '—';
}

function formatPersonLabel(row) {
  const name = String(row?.displayName || row?.fullName || row?.name || '').trim();
  const id = String(row?.userId || row?.id || '').trim();
  return name || id || '?';
}

/**
 * Prefer explicit startDate/dueDate; else min/max days[].dateKey (legacy packs).
 * @returns {{ start: string|null, due: string|null }}
 */
function resolveWorkRowDates(row) {
  const start = row?.startDate ? String(row.startDate).trim() : '';
  const due = row?.dueDate ? String(row.dueDate).trim() : '';
  if (start && due) return { start, due };
  const keys = asArray(row?.days)
    .map((d) => String(d?.dateKey || '').trim())
    .filter(Boolean)
    .sort();
  const fromDaysStart = keys[0] || null;
  const fromDaysDue = keys.length ? keys[keys.length - 1] : null;
  return {
    start: start || fromDaysStart,
    due: due || fromDaysDue,
  };
}

function formatShortlist(shortlist) {
  const rows = asArray(shortlist);
  if (!rows.length) return '—';
  return rows
    .slice(0, 5)
    .map((s) => {
      const label = formatPersonLabel(s);
      const score = s?.score != null ? ` (${s.score})` : '';
      return `${label}${score}`;
    })
    .join(', ');
}

function EmptyHint({ t }) {
  return <p className="text-sm text-muted-foreground">{t('requirements.aiAnalysisPreviewEmpty')}</p>;
}

function wallBudgetSkippedCount(meta) {
  const n = Number(meta?.wallBudgetSkippedInputCount);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function WallBudgetSkipBanner({ meta, t }) {
  const count = wallBudgetSkippedCount(meta);
  if (!count) return null;
  return (
    <p className="text-sm text-amber-800 dark:text-amber-200">
      {t('requirements.aiAnalysisPreviewWallBudgetSkipped', { count })}
    </p>
  );
}

function sumWallBudgetSkipped(...metas) {
  return metas.reduce((sum, meta) => sum + wallBudgetSkippedCount(meta), 0);
}

function SimpleTable({ columns, rows, emptyLabel, onRowClick, selectedId }) {
  if (!rows.length) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
        <thead className="sticky top-0 z-10 bg-muted text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <tr>
            {columns.map((col) => (
              <th key={col.key} className="px-3 py-2 font-semibold">
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => {
            const rowId = row._key || row.id || idx;
            const selected = selectedId != null && String(selectedId) === String(rowId);
            return (
              <tr
                key={rowId}
                className={`border-t border-border align-top ${
                  onRowClick ? 'cursor-pointer hover:bg-muted/40' : ''
                } ${selected ? 'bg-primary/5' : ''}`}
                onClick={() => onRowClick?.(row)}
              >
                {columns.map((col) => (
                  <td key={col.key} className="px-3 py-2 text-foreground">
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h4>
      {children}
    </div>
  );
}

function PreviewRequirementAnalysis({ dto, t, onRowClick, selectedId }) {
  const findings = buildRequirementFindingRows(dto, t);
  const entities = asArray(dto?.analyses?.data?.entities);
  const flows = asArray(dto?.analyses?.data?.dataFlows);
  const empty = t('requirements.aiAnalysisPreviewEmpty');
  const skippedTotal = sumWallBudgetSkipped(dto?.analyses?.gap?.meta, dto?.analyses?.data?.meta);

  if (!findings.length && !entities.length && !flows.length) {
    if (skippedTotal > 0) {
      return (
        <p className="text-sm text-amber-800 dark:text-amber-200">
          {t('requirements.aiAnalysisPreviewWallBudgetSkipped', { count: skippedTotal })}
        </p>
      );
    }
    return <EmptyHint t={t} />;
  }

  return (
    <div className="space-y-5">
      {skippedTotal > 0 ? (
        <p className="text-sm text-amber-800 dark:text-amber-200">
          {t('requirements.aiAnalysisPreviewWallBudgetSkipped', { count: skippedTotal })}
        </p>
      ) : null}
      {findings.length ? (
        <Section title={t('requirements.aiAnalysisPreviewGaps')}>
          <SimpleTable
            emptyLabel={empty}
            selectedId={selectedId}
            onRowClick={onRowClick}
            columns={[
              {
                key: 'id',
                label: t('requirements.aiAnalysisPreviewColId'),
                render: (r) => r.id,
              },
              {
                key: 'module',
                label: t('requirements.aiAnalysisPreviewColModule'),
                render: (r) => r.module,
              },
              {
                key: 'req',
                label: t('requirements.aiAnalysisColRequirement'),
                render: (r) => r.requirement,
              },
              {
                key: 'priority',
                label: t('requirements.aiAnalysisColPriority'),
                render: (r) => r.priority,
              },
              {
                key: 'assess',
                label: t('requirements.aiAnalysisColAssessment'),
                render: (r) => r.assessmentLabel,
              },
              {
                key: 'status',
                label: t('requirements.aiAnalysisJobColStatus'),
                render: (r) => r.status,
              },
            ]}
            rows={findings.map((f) => ({ ...f, _key: f.id }))}
          />
        </Section>
      ) : null}
      {entities.length ? (
        <Section title={t('requirements.aiAnalysisPreviewEntities')}>
          <SimpleTable
            emptyLabel={empty}
            columns={[
              {
                key: 'name',
                label: t('requirements.aiAnalysisPreviewColName'),
                render: (r) => r.name || r.entityId || '—',
              },
              {
                key: 'attrs',
                label: t('requirements.aiAnalysisPreviewColAttrs'),
                render: (r) => formatAttrs(r.attributes),
              },
              {
                key: 'crud',
                label: t('requirements.aiAnalysisPreviewColCrud'),
                render: (r) => formatCrud(r.crud),
              },
            ]}
            rows={entities.map((e, i) => ({ ...e, _key: e.entityId || i }))}
          />
        </Section>
      ) : null}
      {flows.length ? (
        <Section title={t('requirements.aiAnalysisPreviewDataFlows')}>
          <SimpleTable
            emptyLabel={empty}
            columns={[
              {
                key: 'from',
                label: t('requirements.aiAnalysisPreviewColFrom'),
                render: (r) => r.from || '—',
              },
              {
                key: 'to',
                label: t('requirements.aiAnalysisPreviewColTo'),
                render: (r) => r.to || '—',
              },
              {
                key: 'via',
                label: t('requirements.aiAnalysisPreviewColType'),
                render: (r) => r.via || r.type || '—',
              },
            ]}
            rows={flows.map((f, i) => ({ ...f, _key: `${f.from}-${f.to}-${i}` }))}
          />
        </Section>
      ) : null}
    </div>
  );
}

function PreviewHierarchy({ dto, t }) {
  const hierarchy = dto?.analyses?.hierarchy || {};
  const features = asArray(hierarchy.proposedFeatures);
  const requirements = asArray(hierarchy.proposedRequirements);
  const empty = t('requirements.aiAnalysisPreviewEmpty');
  const skipped = wallBudgetSkippedCount(hierarchy.meta);

  if (!features.length && !requirements.length) {
    if (skipped > 0) return <WallBudgetSkipBanner meta={hierarchy.meta} t={t} />;
    return <EmptyHint t={t} />;
  }

  const proposalColumns = [
    {
      key: 'id',
      label: t('requirements.aiAnalysisPreviewColId'),
      render: (r) => r.proposalId || '—',
    },
    {
      key: 'parent',
      label: t('requirements.aiAnalysisHierarchyParent'),
      render: (r) => r.parentExternalId || '—',
    },
    {
      key: 'level',
      label: t('requirements.aiAnalysisHierarchyLevel'),
      render: (r) => r.level || '—',
    },
    {
      key: 'name',
      label: t('requirements.aiAnalysisHierarchyName'),
      render: (r) => r.name || '—',
    },
    {
      key: 'desc',
      label: t('requirements.aiAnalysisJobColDescription'),
      render: (r) => r.description || '—',
    },
    {
      key: 'status',
      label: t('requirements.aiAnalysisJobColStatus'),
      render: (r) => r.status || '—',
    },
  ];

  return (
    <div className="space-y-5">
      <WallBudgetSkipBanner meta={hierarchy.meta} t={t} />
      <p className="text-sm text-muted-foreground">
        {t('requirements.aiAnalysisHierarchyAgileEpicHint')}
      </p>
      <Section title={t('requirements.aiAnalysisPreviewProposedFeatures')}>
        <SimpleTable
          emptyLabel={empty}
          columns={proposalColumns}
          rows={features.map((f, i) => ({ ...f, _key: f.proposalId || `feat-${i}` }))}
        />
      </Section>
      <Section title={t('requirements.aiAnalysisPreviewProposedRequirements')}>
        <SimpleTable
          emptyLabel={empty}
          columns={proposalColumns}
          rows={requirements.map((r, i) => ({ ...r, _key: r.proposalId || `req-${i}` }))}
        />
      </Section>
    </div>
  );
}

function PreviewCapability({ dto, t }) {
  const caps = asArray(dto?.analyses?.capability?.items);
  const empty = t('requirements.aiAnalysisPreviewEmpty');
  const capMeta = dto?.analyses?.capability?.meta;
  const skipped = wallBudgetSkippedCount(capMeta);
  if (!caps.length) {
    if (skipped > 0) return <WallBudgetSkipBanner meta={capMeta} t={t} />;
    return <EmptyHint t={t} />;
  }

  return (
    <div className="space-y-5">
      <WallBudgetSkipBanner meta={capMeta} t={t} />
      <Section title={t('requirements.aiAnalysisPreviewCapabilities')}>
        <SimpleTable
          emptyLabel={empty}
          columns={[
            {
              key: 'id',
              label: t('requirements.aiAnalysisPreviewColId'),
              render: (r) => r.capabilityId || '—',
            },
            {
              key: 'name',
              label: t('requirements.aiAnalysisPreviewColName'),
              render: (r) => r.name || '—',
            },
            {
              key: 'module',
              label: t('requirements.aiAnalysisPreviewColModule'),
              render: (r) => r.module || '—',
            },
            {
              key: 'fr',
              label: t('requirements.aiAnalysisPreviewColFrCount'),
              render: (r) => asArray(r.sourceFrIds).length,
            },
            {
              key: 'cx',
              label: t('requirements.aiAnalysisPreviewColComplexity'),
              render: (r) => r.complexity || '—',
            },
          ]}
          rows={caps.map((c, i) => ({ ...c, _key: c.capabilityId || i }))}
        />
      </Section>
    </div>
  );
}

function PreviewWbs({ dto, t }) {
  const tasks = asArray(dto?.planning?.tasks);
  const empty = t('requirements.aiAnalysisPreviewEmpty');
  const wbsMeta = dto?.planning?.wbs?.meta;
  const skipped = wallBudgetSkippedCount(wbsMeta);
  if (!tasks.length) {
    if (skipped > 0) return <WallBudgetSkipBanner meta={wbsMeta} t={t} />;
    return <EmptyHint t={t} />;
  }

  return (
    <div className="space-y-5">
      <WallBudgetSkipBanner meta={wbsMeta} t={t} />
      <Section title={t('requirements.aiAnalysisPreviewTasks')}>
        <SimpleTable
          emptyLabel={empty}
          columns={[
            {
              key: 'id',
              label: t('requirements.aiAnalysisPreviewColId'),
              render: (r) => r.id || '—',
            },
            {
              key: 'name',
              label: t('requirements.aiAnalysisPreviewColName'),
              render: (r) => r.name || '—',
            },
            {
              key: 'parent',
              label: t('requirements.aiAnalysisPreviewColFrom'),
              render: (r) => r.parentId || '—',
            },
            {
              key: 'area',
              label: t('requirements.aiAnalysisPreviewColArea'),
              render: (r) => r.area || '—',
            },
            {
              key: 'role',
              label: t('requirements.aiAnalysisPreviewColRole'),
              render: (r) => r.suggestedRoleKey || '—',
            },
          ]}
          rows={tasks.map((task, i) => ({ ...task, _key: task.id || i }))}
        />
      </Section>
    </div>
  );
}

function PreviewDependency({ dto, t }) {
  const edges = asArray(dto?.analyses?.dependency?.edges);
  const orderHint = asArray(dto?.analyses?.dependency?.orderHint);
  const empty = t('requirements.aiAnalysisPreviewEmpty');
  if (!edges.length && !orderHint.length) return <EmptyHint t={t} />;

  return (
    <div className="space-y-5">
      <Section title={t('requirements.aiAnalysisPreviewDependencies')}>
        <SimpleTable
          emptyLabel={empty}
          columns={[
            {
              key: 'from',
              label: t('requirements.aiAnalysisPreviewColFrom'),
              render: (r) => r.from || '—',
            },
            {
              key: 'to',
              label: t('requirements.aiAnalysisPreviewColTo'),
              render: (r) => r.to || '—',
            },
            {
              key: 'kind',
              label: t('requirements.aiAnalysisPreviewColKind'),
              render: (r) => r.dependency || r.kind || '—',
            },
            {
              key: 'type',
              label: t('requirements.aiAnalysisPreviewColType'),
              render: (r) => r.type || '—',
            },
            {
              key: 'src',
              label: t('requirements.aiAnalysisPreviewColSource'),
              render: (r) => r.source || '—',
            },
          ]}
          rows={edges.map((e, i) => ({ ...e, _key: e.edgeId || i }))}
        />
      </Section>
      {orderHint.length ? (
        <Section title={t('requirements.aiAnalysisPreviewOrderHint')}>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-foreground">
            {orderHint.slice(0, 80).map((id) => (
              <li key={id}>{id}</li>
            ))}
          </ol>
        </Section>
      ) : null}
    </div>
  );
}

function PreviewRoleSkill({ dto, t }) {
  const roles = asArray(dto?.planning?.roles);
  const skills = asArray(dto?.planning?.skills);
  const effort = dto?.planning?.effort || {};
  const byRole = effort.byRole && typeof effort.byRole === 'object' ? effort.byRole : {};
  const byRoleRows = Object.entries(byRole).map(([roleKey, hours]) => ({
    roleKey,
    hours,
    _key: roleKey,
  }));
  const empty = t('requirements.aiAnalysisPreviewEmpty');
  const hasEffort =
    effort.estimatedHoursTotal != null || byRoleRows.length > 0 || effort.status;

  if (!roles.length && !skills.length && !hasEffort) return <EmptyHint t={t} />;

  return (
    <div className="space-y-5">
      <Section title={t('requirements.aiAnalysisPreviewRoles')}>
        <SimpleTable
          emptyLabel={empty}
          columns={[
            {
              key: 'role',
              label: t('requirements.aiAnalysisPreviewColRole'),
              render: (r) => r.roleKey || '—',
            },
            {
              key: 'src',
              label: t('requirements.aiAnalysisPreviewColType'),
              render: (r) => r.source || '—',
            },
          ]}
          rows={roles.map((r, i) => ({ ...r, _key: r.roleKey || i }))}
        />
      </Section>
      <Section title={t('requirements.aiAnalysisPreviewSkills')}>
        <SimpleTable
          emptyLabel={empty}
          columns={[
            {
              key: 'name',
              label: t('requirements.aiAnalysisPreviewColName'),
              render: (r) => r.name || '—',
            },
            {
              key: 'level',
              label: t('requirements.aiAnalysisPreviewColLevel'),
              render: (r) => r.level || '—',
            },
          ]}
          rows={skills.map((s, i) => ({ ...s, _key: s.name || i }))}
        />
      </Section>
      <Section title={t('requirements.aiAnalysisPreviewEffort')}>
        {effort.estimatedHoursTotal != null ? (
          <p className="mb-2 text-sm text-foreground">
            {t('requirements.aiAnalysisPreviewEffortTotal', {
              hours: effort.estimatedHoursTotal,
            })}
          </p>
        ) : null}
        <SimpleTable
          emptyLabel={empty}
          columns={[
            {
              key: 'role',
              label: t('requirements.aiAnalysisPreviewColRole'),
              render: (r) => r.roleKey,
            },
            {
              key: 'hours',
              label: t('requirements.aiAnalysisPreviewColHours'),
              render: (r) => r.hours ?? '—',
            },
          ]}
          rows={byRoleRows}
        />
      </Section>
    </div>
  );
}

function PreviewArchitectureRisk({ dto, t }) {
  const impacts = asArray(dto?.analyses?.architectureImpact?.items);
  const risks = asArray(dto?.analyses?.risk?.items);
  const empty = t('requirements.aiAnalysisPreviewEmpty');
  if (!impacts.length && !risks.length) return <EmptyHint t={t} />;

  return (
    <div className="space-y-5">
      <Section title={t('requirements.aiAnalysisPreviewArchImpact')}>
        <SimpleTable
          emptyLabel={empty}
          columns={[
            {
              key: 'comp',
              label: t('requirements.aiAnalysisPreviewColComponent'),
              render: (r) => r.component || r.impactId || '—',
            },
            {
              key: 'layer',
              label: t('requirements.aiAnalysisPreviewColLayer'),
              render: (r) => r.layer || '—',
            },
            {
              key: 'lvl',
              label: t('requirements.aiAnalysisPreviewColImpact'),
              render: (r) => r.impactLevel || '—',
            },
          ]}
          rows={impacts.map((r, i) => ({ ...r, _key: r.impactId || i }))}
        />
      </Section>
      <Section title={t('requirements.aiAnalysisPreviewRisks')}>
        <SimpleTable
          emptyLabel={empty}
          columns={[
            {
              key: 'title',
              label: t('requirements.aiAnalysisPreviewColTitle'),
              render: (r) => r.title || r.riskId || '—',
            },
            {
              key: 'score',
              label: t('requirements.aiAnalysisPreviewColScore'),
              render: (r) => r.score ?? '—',
            },
            {
              key: 'band',
              label: t('requirements.aiAnalysisPreviewColBand'),
              render: (r) => r.band || '—',
            },
            {
              key: 'mit',
              label: t('requirements.aiAnalysisPreviewColMitigation'),
              render: (r) => r.mitigation || '—',
            },
          ]}
          rows={risks.map((r, i) => ({ ...r, _key: r.riskId || i }))}
        />
      </Section>
    </div>
  );
}

function PreviewSequencingCpm({ dto, t }) {
  const cpm = dto?.planning?.theoreticalCpm || {};
  const nodes = asArray(cpm.nodes);
  const waves = asArray(dto?.planning?.sequence?.waves);
  const path = asArray(cpm.criticalPath);
  const empty = t('requirements.aiAnalysisPreviewEmpty');
  if (!nodes.length && !path.length && !waves.length) return <EmptyHint t={t} />;

  return (
    <div className="space-y-5">
      <div className="rounded-md border border-border bg-muted/30 px-3 py-3 text-sm">
        <p className="font-medium text-foreground">
          {t('requirements.aiAnalysisPreviewCriticalPath')}:{' '}
          {path.length ? path.join(' → ') : '—'}
        </p>
        <p className="mt-1 text-muted-foreground">
          {t('requirements.aiAnalysisPreviewSumVsPath', {
            sum: cpm.sumEffortHours ?? '—',
            path: cpm.projectDurationHours ?? '—',
          })}
        </p>
      </div>
      {waves.length ? (
        <Section title={t('requirements.aiAnalysisPreviewWaves')}>
          <div className="flex flex-wrap gap-2">
            {waves.map((wave, i) => (
              <span
                key={`wave-${i}`}
                className="rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground"
              >
                {i + 1}: {asArray(wave).join(', ') || '—'}
              </span>
            ))}
          </div>
        </Section>
      ) : null}
      <Section title={t('requirements.aiAnalysisPreviewCpmNodes')}>
        <SimpleTable
          emptyLabel={empty}
          columns={[
            {
              key: 'id',
              label: t('requirements.aiAnalysisPreviewColId'),
              render: (r) => r.workId || '—',
            },
            {
              key: 'dur',
              label: t('requirements.aiAnalysisPreviewColDur'),
              render: (r) => r.durationHours ?? '—',
            },
            {
              key: 'es',
              label: t('requirements.aiAnalysisPreviewColEs'),
              render: (r) => r.es ?? '—',
            },
            {
              key: 'ef',
              label: t('requirements.aiAnalysisPreviewColEf'),
              render: (r) => r.ef ?? '—',
            },
            {
              key: 'float',
              label: t('requirements.aiAnalysisPreviewColFloat'),
              render: (r) => r.totalFloat ?? '—',
            },
            {
              key: 'crit',
              label: t('requirements.aiAnalysisPreviewColCritical'),
              render: (r) =>
                r.isCritical
                  ? t('requirements.aiAnalysisPreviewYes')
                  : t('requirements.aiAnalysisPreviewNo'),
            },
          ]}
          rows={nodes.map((n, i) => ({ ...n, _key: n.workId || i }))}
        />
      </Section>
    </div>
  );
}

function PreviewScheduleCapacity({ dto, t }) {
  const assignments = asArray(dto?.resource?.assignments);
  const schedule = asArray(dto?.resource?.schedule);
  const completion = dto?.planning?.completion || {};
  const assignMeta = dto?.resource?.assignmentsMeta;
  const empty = assignmentEmptyMessage(dto, t);

  if (!assignments.length && !schedule.length) {
    return <p className="text-sm text-muted-foreground">{empty}</p>;
  }

  return (
    <div className="space-y-5">
      <WallBudgetSkipBanner meta={assignMeta} t={t} />
      <Section title={t('requirements.aiAnalysisPreviewCompletion')}>
        <div className="space-y-1 rounded-md border border-border bg-muted/30 px-3 py-3 text-sm">
          <p>
            {t('requirements.aiAnalysisPreviewProjectStart', {
              date: completion.projectStart || '—',
            })}
          </p>
          <p>
            {t('requirements.aiAnalysisPreviewProjectEnd', {
              date: completion.estimatedEnd || '—',
            })}
          </p>
          <p className="text-muted-foreground">
            {t('requirements.aiAnalysisPreviewCriticalPath')}:{' '}
            {asArray(completion.criticalPath).join(' → ') || '—'}
          </p>
        </div>
      </Section>
      <Section title={t('requirements.aiAnalysisPreviewAssignments')}>
        <SimpleTable
          emptyLabel={empty}
          columns={[
            {
              key: 'task',
              label: t('requirements.aiAnalysisPreviewColTask'),
              render: (r) => r.taskId || '—',
            },
            {
              key: 'user',
              label: t('requirements.aiAnalysisPreviewColUser'),
              render: (r) => formatPersonLabel(r),
            },
            {
              key: 'why',
              label: t('requirements.aiAnalysisPreviewColRationale'),
              render: (r) => r.rationale || '—',
            },
          ]}
          rows={assignments.map((r, i) => ({ ...r, _key: `${r.taskId}-${r.userId}-${i}` }))}
        />
      </Section>
      <Section title={t('requirements.aiAnalysisPreviewTasks')}>
        <SimpleTable
          emptyLabel={empty}
          columns={[
            {
              key: 'task',
              label: t('requirements.aiAnalysisPreviewColTask'),
              render: (r) => r.id || r.taskId || '—',
            },
            {
              key: 'start',
              label: t('requirements.aiAnalysisPreviewColStart'),
              render: (r) => r.startDate || '—',
            },
            {
              key: 'due',
              label: t('requirements.aiAnalysisPreviewColDue'),
              render: (r) => r.dueDate || '—',
            },
            {
              key: 'hours',
              label: t('requirements.aiAnalysisPreviewColHours'),
              render: (r) => r.effortHours ?? '—',
            },
          ]}
          rows={asArray(dto?.planning?.tasks)
            .filter((t) => t?.startDate || t?.dueDate)
            .map((t, i) => ({ ...t, _key: t.id || t.taskId || i }))}
        />
      </Section>
      <Section title={t('requirements.aiAnalysisPreviewScheduleDays')}>
        <SimpleTable
          emptyLabel={empty}
          columns={[
            {
              key: 'task',
              label: t('requirements.aiAnalysisPreviewColTask'),
              render: (r) => r.taskId || '—',
            },
            {
              key: 'user',
              label: t('requirements.aiAnalysisPreviewColUser'),
              render: (r) => formatPersonLabel(r),
            },
            {
              key: 'date',
              label: t('requirements.aiAnalysisPreviewColDate'),
              render: (r) => r.dateKey || '—',
            },
            {
              key: 'hours',
              label: t('requirements.aiAnalysisPreviewColHours'),
              render: (r) => r.hours ?? '—',
            },
            {
              key: 'meet',
              label: t('requirements.aiAnalysisPreviewColMeeting'),
              render: (r) => r.meetingHours ?? 0,
            },
            {
              key: 'used',
              label: t('requirements.aiAnalysisPreviewColUsed'),
              render: (r) => r.usedAfter ?? '—',
            },
          ]}
          rows={schedule.map((r, i) => ({
            ...r,
            _key: `${r.taskId}-${r.dateKey}-${i}`,
          }))}
        />
      </Section>
    </div>
  );
}

function PreviewProjectPlan({ dto, t }) {
  const plan = dto?.planning?.executionPlan || {};
  const works = asArray(plan.works);
  const empty = t('requirements.aiAnalysisPreviewEmpty');
  if (!works.length && !plan.estimatedEnd && !plan.projectStart) {
    return <EmptyHint t={t} />;
  }

  return (
    <div className="space-y-5">
      <Section title={t('requirements.aiAnalysisPreviewExecutionPlan')}>
        <div className="space-y-1 rounded-md border border-border bg-muted/30 px-3 py-3 text-sm">
          <p>
            {t('requirements.aiAnalysisPreviewProjectStart', {
              date: plan.projectStart || '—',
            })}
          </p>
          <p>
            {t('requirements.aiAnalysisPreviewProjectEnd', {
              date: plan.estimatedEnd || '—',
            })}
          </p>
          <p className="text-muted-foreground">
            {t('requirements.aiAnalysisPreviewCriticalPath')}:{' '}
            {asArray(plan.criticalPath).join(' → ') || '—'}
          </p>
          {plan.totalEffortHours != null ? (
            <p>
              {t('requirements.aiAnalysisPreviewEffortTotal', {
                hours: plan.totalEffortHours,
              })}
            </p>
          ) : null}
        </div>
      </Section>
      <Section title={t('requirements.aiAnalysisPreviewTasks')}>
        <SimpleTable
          emptyLabel={empty}
          columns={[
            {
              key: 'task',
              label: t('requirements.aiAnalysisPreviewColTask'),
              render: (r) => r.taskId || '—',
            },
            {
              key: 'user',
              label: t('requirements.aiAnalysisPreviewColUser'),
              render: (r) => formatPersonLabel(r),
            },
            {
              key: 'start',
              label: t('requirements.aiAnalysisPreviewColStart'),
              render: (r) => resolveWorkRowDates(r).start || '—',
            },
            {
              key: 'due',
              label: t('requirements.aiAnalysisPreviewColDue'),
              render: (r) => resolveWorkRowDates(r).due || '—',
            },
            {
              key: 'days',
              label: t('requirements.aiAnalysisPreviewColDate'),
              render: (r) =>
                asArray(r.days)
                  .map((d) => `${d.dateKey} (${d.hours}h)`)
                  .join(', ') || '—',
            },
          ]}
          rows={works.map((w, i) => ({ ...w, _key: w.taskId || i }))}
        />
      </Section>
    </div>
  );
}

function PreviewMatching({ dto, t }) {
  const fte = asArray(dto?.resource?.fte);
  const recs = asArray(dto?.resource?.recommendations);
  const empty = t('requirements.aiAnalysisPreviewEmpty');
  const err = String(dto?.error?.message || dto?.error || '')
    .trim()
    .toLowerCase();
  if (!fte.length && !recs.length) {
    if (err === 'empty_pool' || err.includes('empty_pool')) {
      return (
        <p className="text-sm text-muted-foreground">
          {t('requirements.aiAnalysisPreviewEmptyPool')}
        </p>
      );
    }
    return <EmptyHint t={t} />;
  }

  const hasAnyShortlist = recs.some((r) => asArray(r.shortlist).some((s) => s?.userId));
  const poolHint =
    err === 'empty_pool' || err.includes('empty_pool') || !hasAnyShortlist
      ? t('requirements.aiAnalysisPreviewEmptyPool')
      : null;

  return (
    <div className="space-y-5">
      {poolHint ? <p className="text-sm text-amber-800 dark:text-amber-200">{poolHint}</p> : null}
      <Section title={t('requirements.aiAnalysisPreviewFte')}>
        <SimpleTable
          emptyLabel={empty}
          columns={[
            {
              key: 'role',
              label: t('requirements.aiAnalysisPreviewColRole'),
              render: (r) => r.roleKey || '—',
            },
            {
              key: 'count',
              label: t('requirements.aiAnalysisPreviewColCount'),
              render: (r) => r.count ?? '—',
            },
          ]}
          rows={fte.map((r, i) => ({ ...r, _key: r.roleKey || i }))}
        />
      </Section>
      <Section title={t('requirements.aiAnalysisPreviewRecommendations')}>
        <SimpleTable
          emptyLabel={empty}
          columns={[
            {
              key: 'task',
              label: t('requirements.aiAnalysisPreviewColTask'),
              render: (r) => r.taskId || '—',
            },
            {
              key: 'list',
              label: t('requirements.aiAnalysisPreviewColShortlist'),
              render: (r) => formatShortlist(r.shortlist),
            },
          ]}
          rows={recs.map((r, i) => ({ ...r, _key: r.taskId || i }))}
        />
      </Section>
    </div>
  );
}

function assignmentEmptyMessage(dto, t) {
  const status = String(dto?.status || '').toLowerCase();
  const err = String(dto?.error?.message || dto?.error || '')
    .trim()
    .toLowerCase();
  const hasRun =
    Boolean(dto?.generatedAt) || ['ready', 'confirmed', 'failed', 'stale'].includes(status);
  const skipped = wallBudgetSkippedCount(dto?.resource?.assignmentsMeta);

  if (!dto || status === 'empty' || !hasRun) {
    return t('requirements.aiAnalysisPreviewEmpty');
  }
  if (err === 'empty_shortlist' || err.includes('empty_shortlist')) {
    return t('requirements.aiAnalysisPreviewEmptyShortlist');
  }
  if (err === 'empty_recommendations' || err.includes('empty_recommendations')) {
    return t('requirements.aiAnalysisPreviewEmptyRecommendations');
  }
  if (err === 'wall_budget' || err.includes('wall_budget') || skipped > 0) {
    if (skipped > 0) {
      return t('requirements.aiAnalysisPreviewEmptyWallBudgetCount', { count: skipped });
    }
    return t('requirements.aiAnalysisPreviewEmptyWallBudget');
  }
  return t('requirements.aiAnalysisPreviewEmptyAssignments');
}

export default function AiAnalysisJobPreview({
  job,
  dto,
  t,
  onFindingClick,
  selectedFindingId,
}) {
  if (!dto) {
    return <EmptyHint t={t} />;
  }

  switch (job) {
    case 'hierarchyDecomposition':
      return <PreviewHierarchy dto={dto} t={t} />;
    case 'requirementAnalysis':
      return (
        <PreviewRequirementAnalysis
          dto={dto}
          t={t}
          onRowClick={onFindingClick}
          selectedId={selectedFindingId}
        />
      );
    case 'capabilityAnalysis':
      return <PreviewCapability dto={dto} t={t} />;
    case 'wbsGeneration':
      return <PreviewWbs dto={dto} t={t} />;
    case 'dependencyAnalysis':
      return <PreviewDependency dto={dto} t={t} />;
    case 'architectureRiskAnalysis':
      return <PreviewArchitectureRisk dto={dto} t={t} />;
    case 'effortRoleAnalysis':
      return <PreviewRoleSkill dto={dto} t={t} />;
    case 'sequencingCpm':
      return <PreviewSequencingCpm dto={dto} t={t} />;
    case 'employeeMatching':
      return <PreviewMatching dto={dto} t={t} />;
    case 'scheduleCapacity':
      return <PreviewScheduleCapacity dto={dto} t={t} />;
    case 'projectPlan':
      return <PreviewProjectPlan dto={dto} t={t} />;
    default:
      return <EmptyHint t={t} />;
  }
}
