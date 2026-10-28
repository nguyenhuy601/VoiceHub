/**
 * Gate1 rows for FrDecompose Epic→Story tree (srsProposal.generated.backlogStructure).
 */

function clip(value, max = 200) {
  const text = String(value ?? '').trim();
  if (!text) return '—';
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}

/** Drop temporary fr-from-cr chunk prefix from epic titles (`c0-EPIC-IOT` → `EPIC-IOT`). */
function stripChunkIdPrefix(raw) {
  return String(raw || '').replace(/^c\d+-/i, '');
}

function cleanEpicTitle(name, id) {
  const raw = String(name || '').trim();
  const cleanId = stripChunkIdPrefix(id) || id;
  if (!raw || raw === id || raw === cleanId) return cleanId;
  if (/^c\d+-/i.test(raw)) return stripChunkIdPrefix(raw) || raw;
  return raw;
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
  const storiesByEpic = new Map();
  const rootStories = [];

  for (const story of stories) {
    const id = String(story?.id || '').trim();
    if (!id) continue;
    const parent = story.parentEpicId != null ? String(story.parentEpicId).trim() : '';
    const row = {
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
      depth: parent ? 1 : 0,
      status: 'PROPOSED',
      origin: { type: 'DERIVED', engine: 'fr_decompose', section: 'backlogStructure' },
      provenance: { type: 'DERIVED', derivedFrom: [], rule: 'FR_DECOMPOSE' },
    };
    if (parent) {
      if (!storiesByEpic.has(parent)) storiesByEpic.set(parent, []);
      storiesByEpic.get(parent).push(row);
    } else {
      rootStories.push(row);
    }
  }

  for (const epic of epics) {
    const id = String(epic?.id || '').trim();
    if (!id) continue;
    const childStories = storiesByEpic.get(id) || [];
    rows.push({
      logicalId: id,
      id,
      section: 'backlogStructure',
      sectionLabel: 'Backlog',
      level: 'epic',
      title: cleanEpicTitle(epic.name || epic.title, id),
      name: cleanEpicTitle(epic.name || epic.title, id),
      description: clip(epic.description || epic.goal || '', 240),
      parentEpicId: null,
      sourceFrIds: Array.isArray(epic.sourceFrIds) ? epic.sourceFrIds.map(String) : [],
      ac: '—',
      frIdsLabel: (Array.isArray(epic.sourceFrIds) ? epic.sourceFrIds : []).join(', ') || '—',
      parentLabel: '—',
      depth: 0,
      storyCount: childStories.length,
      missingStories: childStories.length === 0,
      status: childStories.length ? 'PROPOSED' : 'NEEDS_STORIES',
      origin: { type: 'DERIVED', engine: 'fr_decompose', section: 'backlogStructure' },
      provenance: { type: 'DERIVED', derivedFrom: [], rule: 'FR_DECOMPOSE' },
    });
    for (const child of childStories) rows.push(child);
    storiesByEpic.delete(id);
  }

  // Stories whose parentEpicId was not in epics (orphan parent → show as root).
  for (const leftover of storiesByEpic.values()) {
    for (const row of leftover) {
      rows.push({ ...row, parentEpicId: null, parentLabel: '—', depth: 0 });
    }
  }
  for (const row of rootStories) rows.push(row);

  return rows;
}
