/**
 * Derive summary chips + selectable finding rows from wizard DTO (FE-only).
 */

import { gapTypeToAssessmentKey } from './aiAnalysisWizardConstants';

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function severityToPriority(sev) {
  const s = String(sev || '').toLowerCase();
  if (s === 'critical') return 'Critical';
  if (s === 'high') return 'High';
  if (s === 'medium') return 'Medium';
  if (s === 'low') return 'Low';
  return '—';
}

export function buildJobSummaryChips(job, dto, t) {
  if (!dto) return [];

  if (job === 'hierarchyDecomposition') {
    const features = asArray(dto?.analyses?.hierarchy?.proposedFeatures);
    const requirements = asArray(dto?.analyses?.hierarchy?.proposedRequirements);
    return [
      {
        key: 'features',
        label: t('requirements.aiAnalysisChipProposedFeatures', { count: features.length }),
      },
      {
        key: 'requirements',
        label: t('requirements.aiAnalysisChipProposedRequirements', {
          count: requirements.length,
        }),
      },
    ];
  }

  if (job === 'requirementAnalysis') {
    const gaps = asArray(dto?.preview?.gaps?.length ? dto.preview.gaps : dto?.analyses?.gap?.items);
    const entities = asArray(dto?.analyses?.data?.entities);
    const counts = dto?.preview?.severityCounts || {};
    const critical = Number(counts.critical || 0);
    const needReview =
      Number(counts.high || 0) + critical ||
      (dto?.preview?.baReviewRequired
        ? gaps.filter((g) => ['high', 'critical'].includes(g.severity)).length
        : 0);
    const total = Math.max(gaps.length + entities.length, gaps.length, 1);
    const complete = Math.max(0, entities.length || total - gaps.length);
    return [
      { key: 'total', label: t('requirements.aiAnalysisChipRequirements', { count: total }) },
      { key: 'complete', label: t('requirements.aiAnalysisChipComplete', { count: complete }) },
      { key: 'review', label: t('requirements.aiAnalysisChipNeedReview', { count: needReview }) },
      { key: 'critical', label: t('requirements.aiAnalysisChipCriticalGap', { count: critical }) },
    ];
  }

  if (job === 'capabilityAnalysis') {
    const caps = asArray(dto?.analyses?.capability?.items);
    return [
      { key: 'caps', label: t('requirements.aiAnalysisChipCapabilities', { count: caps.length }) },
    ];
  }

  if (job === 'wbsGeneration') {
    const tasks = asArray(dto?.planning?.tasks);
    return [
      { key: 'tasks', label: t('requirements.aiAnalysisChipTasks', { count: tasks.length }) },
    ];
  }

  if (job === 'dependencyAnalysis') {
    const edges = asArray(dto?.analyses?.dependency?.edges);
    return [
      { key: 'deps', label: t('requirements.aiAnalysisChipDependencies', { count: edges.length }) },
    ];
  }

  if (job === 'architectureRiskAnalysis') {
    const impacts = asArray(dto?.analyses?.architectureImpact?.items);
    const risks = asArray(dto?.analyses?.risk?.items);
    return [
      { key: 'impact', label: t('requirements.aiAnalysisChipImpacts', { count: impacts.length }) },
      { key: 'risks', label: t('requirements.aiAnalysisChipRisks', { count: risks.length }) },
    ];
  }

  if (job === 'effortRoleAnalysis') {
    const roles = asArray(dto?.planning?.roles);
    const skills = asArray(dto?.planning?.skills);
    const hours = dto?.planning?.effort?.estimatedHoursTotal;
    const chips = [
      { key: 'roles', label: t('requirements.aiAnalysisChipRoles', { count: roles.length }) },
      { key: 'skills', label: t('requirements.aiAnalysisChipSkills', { count: skills.length }) },
    ];
    if (hours != null) {
      chips.push({
        key: 'hours',
        label: t('requirements.aiAnalysisPreviewEffortTotal', { hours }),
      });
    }
    return chips;
  }

  if (job === 'sequencingCpm') {
    const pathHours = dto?.planning?.theoreticalCpm?.projectDurationHours;
    const critical = asArray(dto?.planning?.criticalWorkIds);
    const chips = [
      {
        key: 'critical',
        label: t('requirements.aiAnalysisChipCriticalWorks', { count: critical.length }),
      },
    ];
    if (pathHours != null) {
      chips.push({
        key: 'path',
        label: t('requirements.aiAnalysisChipPathHours', { hours: pathHours }),
      });
    }
    return chips;
  }

  if (job === 'employeeMatching') {
    const fte = asArray(dto?.resource?.fte);
    const recs = asArray(dto?.resource?.recommendations);
    return [
      { key: 'fte', label: t('requirements.aiAnalysisChipFte', { count: fte.length }) },
      { key: 'recs', label: t('requirements.aiAnalysisChipMatches', { count: recs.length }) },
    ];
  }

  if (job === 'scheduleCapacity') {
    const assignments = asArray(dto?.resource?.assignments);
    const schedule = asArray(dto?.resource?.schedule);
    const end = dto?.planning?.completion?.estimatedEnd;
    const chips = [
      {
        key: 'assign',
        label: t('requirements.aiAnalysisChipAssignments', { count: assignments.length }),
      },
      {
        key: 'rows',
        label: t('requirements.aiAnalysisChipScheduleRows', { count: schedule.length }),
      },
    ];
    if (end) {
      chips.push({
        key: 'end',
        label: t('requirements.aiAnalysisChipEstimatedEnd', { date: end }),
      });
    }
    return chips;
  }

  if (job === 'projectPlan') {
    const plan = dto?.planning?.executionPlan;
    const works = asArray(plan?.works);
    const end = plan?.estimatedEnd;
    const chips = [
      {
        key: 'works',
        label: t('requirements.aiAnalysisChipTasks', { count: works.length }),
      },
    ];
    if (end) {
      chips.push({
        key: 'end',
        label: t('requirements.aiAnalysisChipEstimatedEnd', { date: end }),
      });
    }
    return chips;
  }

  return [];
}

/** Rows for Job1 primary assessment table + drawer detail. */
export function buildRequirementFindingRows(dto, t) {
  const gaps = asArray(dto?.preview?.gaps?.length ? dto.preview.gaps : dto?.analyses?.gap?.items);
  return gaps.map((g, i) => {
    const assessmentKey = gapTypeToAssessmentKey(g.type);
    return {
      id: g.gapId || `GAP-${i + 1}`,
      module: (g.relatedFrIds || []).slice(0, 2).join(', ') || g.module || '—',
      requirement: g.issue || g.type || '—',
      priority: severityToPriority(g.severity),
      assessmentKey,
      assessmentLabel: t(`requirements.aiAnalysisAssessment.${assessmentKey}`),
      status: ['high', 'critical'].includes(String(g.severity || '').toLowerCase())
        ? t('requirements.aiAnalysisRowNeedReview')
        : t('requirements.aiAnalysisRowOpen'),
      finding: g.issue || '—',
      impact: severityToPriority(g.severity),
      recommendation: g.recommendation || '—',
      source: (g.relatedFrIds || []).join(', ') || g.source || '—',
      raw: g,
    };
  });
}
