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

function SimpleTable({ columns, rows, emptyLabel, onRowClick, selectedId }) {
  if (!rows.length) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
        <thead className="bg-muted/50 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
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

  if (!findings.length && !entities.length && !flows.length) {
    return <EmptyHint t={t} />;
  }

  return (
    <div className="space-y-5">
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

function PreviewWbs({ dto, t }) {
  const caps = asArray(dto?.analyses?.capability?.items);
  const tasks = asArray(dto?.planning?.tasks);
  const empty = t('requirements.aiAnalysisPreviewEmpty');
  if (!caps.length && !tasks.length) return <EmptyHint t={t} />;

  return (
    <div className="space-y-5">
      <Section title={t('requirements.aiAnalysisPreviewCapabilities')}>
        <SimpleTable
          emptyLabel={empty}
          columns={[
            {
              key: 'name',
              label: t('requirements.aiAnalysisPreviewColName'),
              render: (r) => r.name || r.capabilityId || '—',
            },
            {
              key: 'module',
              label: t('requirements.aiAnalysisPreviewColModule'),
              render: (r) => r.module || '—',
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
  const edges = asArray(dto?.analyses?.dependency?.edges);
  const risks = asArray(dto?.analyses?.risk?.items);
  const empty = t('requirements.aiAnalysisPreviewEmpty');
  if (!impacts.length && !edges.length && !risks.length) return <EmptyHint t={t} />;

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
              key: 'type',
              label: t('requirements.aiAnalysisPreviewColType'),
              render: (r) => r.type || r.dependency || '—',
            },
          ]}
          rows={edges.map((e, i) => ({ ...e, _key: e.edgeId || i }))}
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
  const hasRun = Boolean(dto?.generatedAt) || ['ready', 'confirmed', 'failed', 'stale'].includes(status);

  if (!dto || status === 'empty' || !hasRun) {
    return t('requirements.aiAnalysisPreviewEmpty');
  }
  if (err === 'empty_shortlist' || err.includes('empty_shortlist')) {
    return t('requirements.aiAnalysisPreviewEmptyShortlist');
  }
  if (err === 'empty_recommendations' || err.includes('empty_recommendations')) {
    return t('requirements.aiAnalysisPreviewEmptyRecommendations');
  }
  if (err === 'wall_budget' || err.includes('wall_budget')) {
    return t('requirements.aiAnalysisPreviewEmptyWallBudget');
  }
  return t('requirements.aiAnalysisPreviewEmptyAssignments');
}

function PreviewAssignment({ dto, t }) {
  const assignments = asArray(dto?.resource?.assignments);
  const empty = assignmentEmptyMessage(dto, t);
  if (!assignments.length) {
    return <p className="text-sm text-muted-foreground">{empty}</p>;
  }

  return (
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
  );
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
    case 'requirementAnalysis':
      return (
        <PreviewRequirementAnalysis
          dto={dto}
          t={t}
          onRowClick={onFindingClick}
          selectedId={selectedFindingId}
        />
      );
    case 'wbsGeneration':
      return <PreviewWbs dto={dto} t={t} />;
    case 'roleSkillAnalysis':
      return <PreviewRoleSkill dto={dto} t={t} />;
    case 'architectureRiskAnalysis':
      return <PreviewArchitectureRisk dto={dto} t={t} />;
    case 'employeeMatching':
      return <PreviewMatching dto={dto} t={t} />;
    case 'employeeAssignment':
      return <PreviewAssignment dto={dto} t={t} />;
    default:
      return <EmptyHint t={t} />;
  }
}
