/**
 * Build SRS workbook (IEEE 29148–aligned sheet set) from approved Analysis artifacts.
 * Export-only — does not change import template kinds.
 */
const ExcelJS = require('exceljs');

const CORE_SHEETS = Object.freeze([
  { name: '00_Meta', headers: ['Key', 'Value'] },
  {
    name: '01_Traceability',
    headers: ['FromKind', 'FromKey', 'ToKind', 'ToKey', 'LinkType'],
  },
  {
    name: '02_BG',
    headers: ['ID', 'Title', 'Statement', 'SuccessMetric', 'Stakeholder', 'Priority'],
  },
  {
    name: '03_BR',
    headers: ['ID', 'Title', 'Description', 'WhenApplies', 'Exception', 'RelatedBG', 'Priority'],
  },
  {
    name: '04_BPM',
    headers: ['ID', 'ProcessName', 'Step', 'Actor', 'Action', 'RelatedSystems'],
  },
  {
    name: '05_FR',
    headers: [
      'ID',
      'Level',
      'Module',
      'Feature',
      'Title',
      'Actor',
      'MainBehavior',
      'AcceptanceCriteria',
      'Priority',
    ],
  },
  {
    name: '06_UC',
    headers: ['ID', 'Title', 'Actor', 'Goal', 'Precondition', 'MainFlow', 'RelatedFR', 'Priority'],
  },
  {
    name: '07_NFR',
    headers: ['ID', 'Category', 'Requirement', 'Target', 'Measurement', 'Constraint', 'Priority'],
  },
  {
    name: '08_Scope',
    headers: ['ID', 'ScopeType', 'Description', 'BaNote'],
  },
  {
    name: '09_Interfaces',
    headers: ['ID', 'Name', 'Type', 'Direction', 'Protocol', 'Description', 'Source'],
  },
  {
    name: '10_Data',
    headers: ['ID', 'Entity', 'Attributes', 'Rules', 'Source'],
  },
  {
    name: '11_Glossary',
    headers: ['Term', 'Definition', 'Source'],
  },
  {
    name: '12_Assumptions',
    headers: ['ID', 'Text', 'ImpactIfInvalid', 'Source'],
  },
  {
    name: '13_Verification',
    headers: ['ID', 'RelatedKey', 'Kind', 'Criteria', 'Method'],
  },
  {
    name: '14_ChangeLog',
    headers: ['At', 'Version', 'Note', 'By'],
  },
  {
    name: '15_Purpose',
    headers: ['Key', 'Value'],
  },
  {
    name: '16_UserCharacteristics',
    headers: ['RoleOrTerm', 'Description', 'Source'],
  },
  {
    name: '17_DesignConstraints',
    headers: ['ID', 'Category', 'Constraint', 'Source'],
  },
  {
    name: '18_StandardsCompliance',
    headers: ['Key', 'Value'],
  },
]);

function asText(value) {
  if (value == null) return '';
  if (Array.isArray(value)) return value.map((v) => String(v || '').trim()).filter(Boolean).join('; ');
  return String(value).trim();
}

function structured(row) {
  return row?.structured && typeof row.structured === 'object' ? row.structured : {};
}

function addSheet(wb, name, headers, rows) {
  const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.addRow(headers);
  ws.getRow(1).font = { bold: true };
  for (const row of rows) {
    ws.addRow(row);
  }
  headers.forEach((_, i) => {
    ws.getColumn(i + 1).width = Math.min(40, Math.max(12, headers[i].length + 4));
  });
}

/**
 * @param {{ project?: object, srsVersion?: string, artifacts?: object[], traceLinks?: object[], baseline?: object }} args
 * @returns {Promise<Buffer>}
 */
async function buildSrsExportWorkbook({
  project = {},
  srsVersion = '',
  artifacts = [],
  traceLinks = [],
  baseline = null,
} = {}) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'VoiceHub';
  wb.created = new Date();

  const byKind = (k) => artifacts.filter((a) => String(a.kind || '').toUpperCase() === k);

  addSheet(wb, '00_Meta', ['Key', 'Value'], [
    ['Product', asText(project.name || project.code)],
    ['ProjectCode', asText(project.code)],
    ['SrsVersion', asText(srsVersion || baseline?.srsVersion || 'working')],
    ['GeneratedAt', new Date().toISOString()],
    ['Standard', 'ISO/IEC/IEEE 29148 (mapped sheets)'],
    ['ArtifactCount', String(artifacts.length)],
  ]);

  addSheet(
    wb,
    '01_Traceability',
    ['FromKind', 'FromKey', 'ToKind', 'ToKey', 'LinkType'],
    (traceLinks || []).map((l) => [
      asText(l.fromKind),
      asText(l.fromKey || l.fromExternalKey),
      asText(l.toKind),
      asText(l.toKey || l.toExternalKey),
      asText(l.linkType),
    ])
  );

  addSheet(
    wb,
    '02_BG',
    ['ID', 'Title', 'Statement', 'SuccessMetric', 'Stakeholder', 'Priority'],
    byKind('BG').map((a) => {
      const s = structured(a);
      return [
        asText(a.externalKey),
        asText(a.title),
        asText(s.statement || s.goal || a.summary),
        asText(s.successMetric),
        asText(s.stakeholder),
        asText(s.priority),
      ];
    })
  );

  addSheet(
    wb,
    '03_BR',
    ['ID', 'Title', 'Description', 'WhenApplies', 'Exception', 'RelatedBG', 'Priority'],
    byKind('BR').map((a) => {
      const s = structured(a);
      return [
        asText(a.externalKey),
        asText(a.title),
        asText(s.description || s.businessRule || a.summary),
        asText(s.whenApplies),
        asText(s.exception),
        asText(s.relatedBgKey),
        asText(s.priority),
      ];
    })
  );

  addSheet(
    wb,
    '04_BPM',
    ['ID', 'ProcessName', 'Step', 'Actor', 'Action', 'RelatedSystems'],
    byKind('BPM').map((a) => {
      const s = structured(a);
      return [
        asText(a.externalKey),
        asText(s.processName || a.title),
        asText(s.step),
        asText(s.actor),
        asText(s.action),
        asText(s.relatedSystems),
      ];
    })
  );

  addSheet(
    wb,
    '05_FR',
    [
      'ID',
      'Level',
      'Module',
      'Feature',
      'Title',
      'Actor',
      'MainBehavior',
      'AcceptanceCriteria',
      'Priority',
    ],
    byKind('FR').map((a) => {
      const s = structured(a);
      return [
        asText(a.externalKey),
        asText(s.level),
        asText(s.moduleLabel || s.module),
        asText(s.featureLabel || s.feature),
        asText(a.title),
        asText(s.actor || s.actors),
        asText(s.mainBehavior || s.mainFlow || s.basicFlow),
        asText(s.acceptanceCriteria || s.acceptance),
        asText(s.priority),
      ];
    })
  );

  addSheet(
    wb,
    '06_UC',
    ['ID', 'Title', 'Actor', 'Goal', 'Precondition', 'MainFlow', 'RelatedFR', 'Priority'],
    byKind('UC').map((a) => {
      const s = structured(a);
      return [
        asText(a.externalKey),
        asText(a.title),
        asText(s.actor || s.actors),
        asText(s.goal || s.statement),
        asText(s.precondition),
        asText(s.mainFlow || s.basicFlow),
        asText(s.relatedFrKeys),
        asText(s.priority),
      ];
    })
  );

  addSheet(
    wb,
    '07_NFR',
    ['ID', 'Category', 'Requirement', 'Target', 'Measurement', 'Constraint', 'Priority'],
    byKind('NFR').map((a) => {
      const s = structured(a);
      return [
        asText(a.externalKey),
        asText(s.category),
        asText(a.title || s.requirement),
        asText(s.target || s.metric),
        asText(s.measurement),
        asText(s.constraint || s.constraints),
        asText(s.priority),
      ];
    })
  );

  addSheet(
    wb,
    '08_Scope',
    ['ID', 'ScopeType', 'Description', 'BaNote'],
    byKind('SCOPE').map((a) => {
      const s = structured(a);
      return [
        asText(a.externalKey),
        asText(s.scopeType),
        asText(a.title || s.description),
        asText(s.baNote),
      ];
    })
  );

  // 09_Interfaces — prefer INTERFACE artifacts; fallback derive from relatedSystems
  const interfaceRows = byKind('INTERFACE').map((a) => {
    const s = structured(a);
    return [
      asText(a.externalKey),
      asText(s.interfaceName || a.title),
      asText(s.interfaceType),
      asText(s.direction || 'inout'),
      asText(s.protocol),
      asText(s.description || a.summary || a.title),
      asText(
        Array.isArray(s.relatedArtifactIds) ? s.relatedArtifactIds.join(';') : s.relatedArtifactIds
      ),
    ];
  });
  if (!interfaceRows.length) {
    for (const a of artifacts) {
      const s = structured(a);
      const systems = asText(s.relatedSystems || s.externalSystem || s.interfaceName);
      if (systems) {
        interfaceRows.push([
          `IF-${asText(a.externalKey) || String(a._id).slice(-6)}`,
          systems.slice(0, 120),
          asText(s.interfaceType || a.kind),
          asText(s.direction || 'inout'),
          asText(s.protocol || ''),
          asText(a.summary || a.title),
          asText(a.externalKey),
        ]);
      }
    }
  }
  addSheet(
    wb,
    '09_Interfaces',
    ['ID', 'Name', 'Type', 'Direction', 'Protocol', 'Description', 'Source'],
    interfaceRows
  );

  // 10_Data — prefer DATA artifacts; fallback FR dataEntities
  const dataRows = byKind('DATA').map((a) => {
    const s = structured(a);
    return [
      asText(a.externalKey),
      asText(s.entity || a.title),
      asText(s.attributes),
      asText(s.validationRules || s.rules),
      asText(
        Array.isArray(s.relatedArtifactIds) ? s.relatedArtifactIds.join(';') : a.externalKey
      ),
    ];
  });
  if (!dataRows.length) {
    for (const a of artifacts) {
      const s = structured(a);
      const entity = asText(s.dataEntities || s.entity || s.dataEntity);
      if (entity) {
        dataRows.push([
          `DATA-${asText(a.externalKey) || String(a._id).slice(-6)}`,
          entity.slice(0, 120),
          asText(s.attributes || s.fields),
          asText(s.validationRules || s.rules),
          asText(a.externalKey),
        ]);
      }
    }
  }
  addSheet(wb, '10_Data', ['ID', 'Entity', 'Attributes', 'Rules', 'Source'], dataRows);

  // 11_Glossary — prefer GLOSSARY artifacts
  const glossaryRows = byKind('GLOSSARY').map((a) => {
    const s = structured(a);
    return [asText(s.term || a.title), asText(s.definition || a.summary), asText(a.externalKey)];
  });
  if (!glossaryRows.length) {
    for (const a of byKind('BR').concat(byKind('BG'), byKind('NFR'))) {
      const s = structured(a);
      const term = asText(s.term || s.glossaryTerm);
      if (term) {
        glossaryRows.push([term, asText(s.definition || a.summary || a.title), asText(a.externalKey)]);
      }
    }
  }
  addSheet(wb, '11_Glossary', ['Term', 'Definition', 'Source'], glossaryRows);

  // 12_Assumptions — prefer ASSUMPTION artifacts
  const assumptionRows = byKind('ASSUMPTION').map((a) => {
    const s = structured(a);
    return [
      asText(a.externalKey),
      asText(s.text || a.title || a.summary).slice(0, 500),
      asText(s.impactIfInvalid),
      asText(
        Array.isArray(s.relatedArtifactIds) ? s.relatedArtifactIds.join(';') : a.externalKey
      ),
    ];
  });
  if (!assumptionRows.length) {
    let asmIdx = 0;
    for (const a of artifacts) {
      const s = structured(a);
      const text = asText(s.assumption || s.assumptions);
      if (text) {
        asmIdx += 1;
        assumptionRows.push([
          `ASM-${asmIdx}`,
          text.slice(0, 500),
          asText(s.impactIfInvalid),
          asText(a.externalKey),
        ]);
      }
    }
  }
  addSheet(wb, '12_Assumptions', ['ID', 'Text', 'ImpactIfInvalid', 'Source'], assumptionRows);

  // 13_Verification — FR AC + UC flows
  const verificationRows = [];
  for (const a of byKind('FR')) {
    const s = structured(a);
    const ac = asText(s.acceptanceCriteria || s.acceptance);
    if (ac) {
      verificationRows.push([
        `VER-${asText(a.externalKey)}`,
        asText(a.externalKey),
        'FR',
        ac.slice(0, 500),
        'test',
      ]);
    }
  }
  for (const a of byKind('UC')) {
    const s = structured(a);
    const flow = asText(s.mainFlow || s.basicFlow || s.postcondition);
    if (flow) {
      verificationRows.push([
        `VER-${asText(a.externalKey)}`,
        asText(a.externalKey),
        'UC',
        flow.slice(0, 500),
        'scenario',
      ]);
    }
  }
  addSheet(
    wb,
    '13_Verification',
    ['ID', 'RelatedKey', 'Kind', 'Criteria', 'Method'],
    verificationRows
  );

  addSheet(wb, '14_ChangeLog', ['At', 'Version', 'Note', 'By'], [
    [
      baseline?.approvedAt ? new Date(baseline.approvedAt).toISOString() : new Date().toISOString(),
      asText(srsVersion || baseline?.srsVersion || 'working'),
      asText(baseline?.notes || 'SRS export'),
      asText(baseline?.approvedBy || ''),
    ],
  ]);

  // 15–18 IEEE 29148 §9.6 export-first (DEC R3) — derived from existing kinds, no new Analysis tabs yet
  const scopeRows = byKind('SCOPE');
  const inScope = scopeRows
    .filter((a) => /in/i.test(asText(structured(a).scopeType)))
    .map((a) => asText(a.title || structured(a).description))
    .filter(Boolean);
  const outScope = scopeRows
    .filter((a) => /out/i.test(asText(structured(a).scopeType)))
    .map((a) => asText(a.title || structured(a).description))
    .filter(Boolean);
  const bgSummary = byKind('BG')
    .slice(0, 8)
    .map((a) => `${asText(a.externalKey)}: ${asText(a.title || structured(a).statement)}`)
    .filter((s) => s.length > 2);

  addSheet(wb, '15_Purpose', ['Key', 'Value'], [
    ['Product', asText(project.name || project.code)],
    ['Purpose', asText(project.description || project.summary || 'See Scope + BG sheets')],
    ['IntendedAudience', 'BA, Tech Lead, PO, Development, QA'],
    ['InScopeSummary', inScope.slice(0, 12).join('; ') || '(see 08_Scope)'],
    ['OutOfScopeSummary', outScope.slice(0, 12).join('; ') || '(see 08_Scope)'],
    ['ProductFunctionsSummary', bgSummary.join('; ') || '(see 02_BG / 05_FR)'],
    ['References', 'ISO/IEC/IEEE 29148; VoiceHub Analysis workbook'],
  ]);

  const userCharRows = [];
  for (const a of byKind('GLOSSARY')) {
    const s = structured(a);
    const term = asText(s.term || a.title);
    const def = asText(s.definition || a.summary);
    if (term) userCharRows.push([term, def, asText(a.externalKey)]);
  }
  const actorSeen = new Set();
  for (const a of [...byKind('UC'), ...byKind('FR'), ...byKind('BPM')]) {
    const actor = asText(structured(a).actor || structured(a).actors);
    if (!actor || actorSeen.has(actor.toLowerCase())) continue;
    actorSeen.add(actor.toLowerCase());
    userCharRows.push([actor, `Actor from ${asText(a.kind)} ${asText(a.externalKey)}`, asText(a.externalKey)]);
  }
  if (userCharRows.length === 0) {
    userCharRows.push(['(none)', 'Add GLOSSARY terms or UC/FR actors in Analysis', '']);
  }
  addSheet(wb, '16_UserCharacteristics', ['RoleOrTerm', 'Description', 'Source'], userCharRows);

  const designConstraintRows = [];
  for (const a of byKind('NFR')) {
    const s = structured(a);
    const constraint = asText(s.constraint || s.constraints || a.title);
    if (!constraint) continue;
    designConstraintRows.push([
      asText(a.externalKey),
      asText(s.category || 'NFR'),
      constraint.slice(0, 500),
      'NFR',
    ]);
  }
  for (const a of byKind('ASSUMPTION')) {
    const s = structured(a);
    const text = asText(s.text || a.title || a.summary);
    if (!text) continue;
    designConstraintRows.push([
      asText(a.externalKey),
      'Assumption',
      text.slice(0, 500),
      'ASSUMPTION',
    ]);
  }
  if (designConstraintRows.length === 0) {
    designConstraintRows.push(['', 'DesignConstraint', '(none — capture via NFR Constraint / ASSUMPTION)', '']);
  }
  addSheet(
    wb,
    '17_DesignConstraints',
    ['ID', 'Category', 'Constraint', 'Source'],
    designConstraintRows
  );

  addSheet(wb, '18_StandardsCompliance', ['Key', 'Value'], [
    ['MappingStandard', 'ISO/IEC/IEEE 29148:2018 §9.6 (tailored)'],
    ['WorkingRA', 'VoiceHub Analysis kinds BG/BR/BPM/FR/UC/NFR/SCOPE/INTERFACE/DATA/GLOSSARY/ASSUMPTION'],
    ['Verification', 'See 13_Verification + Planning Test Case catalog'],
    ['ChangeControl', 'Phase 2 Change Request after SRS baseline cut'],
    ['Note', 'Export-first sheets 15–18; authorable Analysis tabs may follow if BA needs'],
  ]);

  // Ensure CORE_SHEETS names exist even if empty (Interfaces/Data already added)
  void CORE_SHEETS;

  return wb.xlsx.writeBuffer();
}

module.exports = {
  buildSrsExportWorkbook,
  CORE_SHEETS,
};
