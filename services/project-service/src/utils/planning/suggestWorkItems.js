/**
 * P2 HITL — pure heuristics for work-item suggestions (WBS → Task, UC gap).
 * No DB writes. Suggest only; confirm is separate.
 */

function asId(value) {
  if (value == null) return '';
  return String(value._id || value.id || value).trim();
}

function asText(value, max = 240) {
  return String(value || '')
    .trim()
    .slice(0, max);
}

/**
 * @param {{
 *   view?: string,
 *   wbsArtifacts?: object[],
 *   epics?: object[],
 *   frByKey?: Map<string, object>|Record<string, object>,
 *   existingTasks?: object[],
 *   useCases?: object[],
 * }} input
 */
function suggestWorkItemsFromWbs(input = {}) {
  const wbsArtifacts = Array.isArray(input.wbsArtifacts) ? input.wbsArtifacts : [];
  const epics = Array.isArray(input.epics) ? input.epics : [];
  const existingTasks = Array.isArray(input.existingTasks) ? input.existingTasks : [];
  const frByKey =
    input.frByKey instanceof Map
      ? input.frByKey
      : new Map(Object.entries(input.frByKey || {}));

  const epicByArtifactId = new Map();
  for (const epic of epics) {
    const src = asId(epic.sourceArtifactId);
    if (src) epicByArtifactId.set(src, epic);
  }

  const claimedWbs = new Set(
    existingTasks
      .map((t) => asId(t.sourceWbsArtifactId))
      .filter(Boolean)
  );

  const suggestions = [];
  const skippedHints = [];

  for (const wbs of wbsArtifacts) {
    const wbsId = asId(wbs);
    if (!wbsId) continue;
    const publishedId = asId(wbs.publishedWorkItemId);
    if (!publishedId) {
      skippedHints.push({
        sourceWbsArtifactId: wbsId,
        reason: 'wbs_not_published',
      });
      continue;
    }
    if (String(wbs.status || '').toLowerCase() !== 'approved') {
      skippedHints.push({
        sourceWbsArtifactId: wbsId,
        reason: 'wbs_not_approved',
      });
      continue;
    }
    if (claimedWbs.has(wbsId)) {
      skippedHints.push({
        sourceWbsArtifactId: wbsId,
        reason: 'task_already_exists',
      });
      continue;
    }

    const epic =
      epicByArtifactId.get(wbsId) ||
      epics.find((e) => asId(e) === publishedId) ||
      null;
    if (!epic) {
      skippedHints.push({
        sourceWbsArtifactId: wbsId,
        reason: 'epic_missing',
      });
      continue;
    }

    const st = wbs.structured && typeof wbs.structured === 'object' ? wbs.structured : {};
    const sourceFrKey = asText(st.sourceFrKey, 120);
    const fr = sourceFrKey ? frByKey.get(sourceFrKey) : null;
    const frTitle = fr ? asText(fr.title || fr.externalKey) : '';
    const title = asText(frTitle || wbs.title || wbs.externalKey || 'Work item');
    const summaryParts = [];
    if (wbs.summary) summaryParts.push(asText(wbs.summary, 800));
    if (fr?.summary) summaryParts.push(asText(fr.summary, 800));
    if (sourceFrKey && !fr) summaryParts.push(`Linked FR ${sourceFrKey}`);

    suggestions.push({
      key: `WI-WBS-${wbsId}`,
      title,
      summary: summaryParts.join('\n').slice(0, 2000),
      epicId: asId(epic),
      epicTitle: asText(epic.title),
      sourceWbsArtifactId: wbsId,
      sourceFrKey: sourceFrKey || undefined,
      issueType: 'story',
      reason: sourceFrKey ? 'from_wbs_with_fr' : 'from_wbs',
    });
  }

  return { view: 'from_wbs', suggestions, skippedHints };
}

/**
 * @param {{
 *   useCases?: object[],
 *   existingTasks?: object[],
 *   wbsArtifacts?: object[],
 *   epics?: object[],
 *   frByKey?: Map<string, object>|Record<string, object>,
 * }} input
 */
function suggestWorkItemsFromUcGap(input = {}) {
  const useCases = Array.isArray(input.useCases) ? input.useCases : [];
  const existingTasks = Array.isArray(input.existingTasks) ? input.existingTasks : [];
  const wbsArtifacts = Array.isArray(input.wbsArtifacts) ? input.wbsArtifacts : [];
  const epics = Array.isArray(input.epics) ? input.epics : [];
  const frByKey =
    input.frByKey instanceof Map
      ? input.frByKey
      : new Map(Object.entries(input.frByKey || {}));

  const claimedUc = new Set(
    existingTasks
      .map((t) => asText(t.sourceUcKey, 120))
      .filter(Boolean)
  );

  const epicByArtifactId = new Map();
  for (const epic of epics) {
    const src = asId(epic.sourceArtifactId);
    if (src) epicByArtifactId.set(src, epic);
  }

  /** FR key → first published WBS epic */
  const epicByFrKey = new Map();
  for (const wbs of wbsArtifacts) {
    if (!asId(wbs.publishedWorkItemId)) continue;
    if (String(wbs.status || '').toLowerCase() !== 'approved') continue;
    const st = wbs.structured && typeof wbs.structured === 'object' ? wbs.structured : {};
    const frKey = asText(st.sourceFrKey, 120);
    if (!frKey) continue;
    const epic = epicByArtifactId.get(asId(wbs));
    if (epic && !epicByFrKey.has(frKey)) epicByFrKey.set(frKey, epic);
  }

  const defaultEpic = epics.find((e) => String(e.type || '').toLowerCase() === 'epic') || epics[0] || null;

  const suggestions = [];
  const skippedHints = [];

  for (const uc of useCases) {
    if (String(uc.status || '').toLowerCase() !== 'approved') continue;
    const ucKey = asText(uc.externalKey || uc.externalId, 120);
    if (!ucKey) continue;
    if (claimedUc.has(ucKey)) {
      skippedHints.push({ sourceUcKey: ucKey, reason: 'task_already_exists' });
      continue;
    }

    const st = uc.structured && typeof uc.structured === 'object' ? uc.structured : {};
    const relatedFr = []
      .concat(st.relatedFrKeys || [])
      .concat(uc.relatedFrKeys || [])
      .map((k) => asText(k, 120))
      .filter(Boolean);

    let epic = null;
    let reason = 'from_uc_gap';
    for (const frKey of relatedFr) {
      if (epicByFrKey.has(frKey)) {
        epic = epicByFrKey.get(frKey);
        reason = 'from_uc_gap_via_fr';
        break;
      }
    }
    if (!epic && defaultEpic) {
      epic = defaultEpic;
      reason = 'unscoped_epic';
    }
    if (!epic) {
      skippedHints.push({ sourceUcKey: ucKey, reason: 'no_published_epic' });
      continue;
    }

    const frKey = relatedFr[0] || '';
    const fr = frKey ? frByKey.get(frKey) : null;
    const wbsForFr = frKey
      ? wbsArtifacts.find((w) => {
          const s = w.structured && typeof w.structured === 'object' ? w.structured : {};
          return asText(s.sourceFrKey, 120) === frKey && asId(w.publishedWorkItemId);
        })
      : null;

    suggestions.push({
      key: `WI-UC-${ucKey}`,
      title: asText(uc.title || ucKey),
      summary: asText(uc.summary || st.mainFlow || st.goal || `From UC ${ucKey}`, 2000),
      epicId: asId(epic),
      epicTitle: asText(epic.title),
      sourceWbsArtifactId: wbsForFr ? asId(wbsForFr) : undefined,
      sourceFrKey: frKey || undefined,
      sourceUcKey: ucKey,
      issueType: 'story',
      reason,
    });
  }

  return { view: 'from_uc_gap', suggestions, skippedHints };
}

/**
 * @param {{ view?: string } & object} input
 */
function suggestWorkItems(input = {}) {
  const view = String(input.view || 'from_wbs')
    .trim()
    .toLowerCase();
  if (view === 'from_uc_gap') return suggestWorkItemsFromUcGap(input);
  return suggestWorkItemsFromWbs(input);
}

module.exports = {
  suggestWorkItems,
  suggestWorkItemsFromWbs,
  suggestWorkItemsFromUcGap,
};
