/**
 * Gate1 rows for FrDecompose Epic→Story tree (srsProposal.generated.backlogStructure).
 */

function clip(value, max = 200) {
  const text = String(value ?? '').trim();
  if (!text) return '—';
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}

/**
 * @param {object|null|undefined} backlogStructure
 * @returns {object[]}
 */
export function buildGate1BacklogStructureRows(backlogStructure) {
  if (!backlogStructure || typeof backlogStructure !== 'object') return [];
  const epics = Array.isArray(backlogStructure.epics) ? backlogStructure.epics : [];
  const stories = Array.isArray(backlogStructure.stories) ? backlogStructure.stories : [];
  const rows = [];

  for (const epic of epics) {
    const id = String(epic?.id || '').trim();
    if (!id) continue;
    rows.push({
      logicalId: id,
      id,
      section: 'backlogStructure',
      sectionLabel: 'Backlog',
      level: 'epic',
      title: String(epic.name || id).trim(),
      name: String(epic.name || id).trim(),
      description: clip(epic.description || epic.goal || '', 240),
      parentEpicId: null,
      sourceFrIds: Array.isArray(epic.sourceFrIds) ? epic.sourceFrIds.map(String) : [],
      ac: '—',
      frIdsLabel: (Array.isArray(epic.sourceFrIds) ? epic.sourceFrIds : []).join(', ') || '—',
      parentLabel: '—',
      status: 'PROPOSED',
      origin: { type: 'DERIVED', engine: 'fr_decompose', section: 'backlogStructure' },
      provenance: { type: 'DERIVED', derivedFrom: [], rule: 'FR_DECOMPOSE' },
    });
  }

  for (const story of stories) {
    const id = String(story?.id || '').trim();
    if (!id) continue;
    const parent = story.parentEpicId != null ? String(story.parentEpicId).trim() : '';
    rows.push({
      logicalId: id,
      id,
      section: 'backlogStructure',
      sectionLabel: 'Backlog',
      level: 'story',
      title: String(story.name || id).trim(),
      name: String(story.name || id).trim(),
      description: clip(story.description || '', 240),
      parentEpicId: parent || null,
      sourceFrIds: Array.isArray(story.sourceFrIds) ? story.sourceFrIds.map(String) : [],
      ac: clip(
        Array.isArray(story.acRefs) ? story.acRefs.join('; ') : '',
        240
      ),
      frIdsLabel: (Array.isArray(story.sourceFrIds) ? story.sourceFrIds : []).join(', ') || '—',
      parentLabel: parent || '—',
      status: 'PROPOSED',
      origin: { type: 'DERIVED', engine: 'fr_decompose', section: 'backlogStructure' },
      provenance: { type: 'DERIVED', derivedFrom: [], rule: 'FR_DECOMPOSE' },
    });
  }

  return rows;
}
