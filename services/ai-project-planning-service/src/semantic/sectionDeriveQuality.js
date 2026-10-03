/**
 * Post-LLM quality guards for section derive (3B often confuses actors/FR with data/IF).
 */

/** Role/actor labels — not domain entity nouns like Employee/Department. */
const ACTOR_ROLE_RE =
  /^(hr\s+)?(admin|manager|user|actor|role|system\s+admin|hr\s+admin|hr\s+manager|nhân viên|truong phong|trưởng phòng)s?$/i;

const FR_ACTION_RE =
  /^(hr|nhân viên|nv|hệ thống|manager|admin|user)\s+\S+/i;

const ENTITY_NOUN_ALLOW =
  /^(employee|department|position|leaverequest|leavebalance|attendancerecord|employmentcontract|employeedocument|notification|hrreport|role|permission)s?$/i;

const INTEGRATION_RE =
  /excel|csv|email|e-?mail|sms|sso|oauth|api|webhook|ftp|s3|minio|notification|notify|import|export|file|upload|download|ldap|active\s*directory|payment|gateway|ocr|pdf/i;

function asArray(v) {
  return Array.isArray(v) ? v : [];
}

function normName(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function actorBanSet(pack, input) {
  const ban = new Set();
  const users = String(
    input?.overview?.expectedUsers || pack?.overview?.expectedUsers || pack?.overview?.targetUsers || ''
  );
  for (const part of users.split(/[,;/|]+/)) {
    const n = normName(part);
    if (n.length >= 2) ban.add(n);
  }
  for (const row of asArray(input?.frSlim || pack?.functionalRequirements)) {
    const actors = String(row.actor || row.primaryActor || '').split(/[,;/|]+/);
    for (const a of actors) {
      const n = normName(a);
      if (n.length >= 2) ban.add(n);
    }
  }
  return ban;
}

function frNameSet(pack, input) {
  const set = new Set();
  for (const row of asArray(input?.frSlim || pack?.functionalRequirements)) {
    const n = normName(row.name || row.title);
    if (n.length >= 8) set.add(n);
  }
  return set;
}

function looksLikeActorEntity(name, ban) {
  const n = normName(name);
  if (!n) return true;
  const compact = n.replace(/\s+/g, '');
  if (ENTITY_NOUN_ALLOW.test(compact)) return false;
  if (ban.has(n)) return true;
  // "HR Admin", "Nhân viên", "System Admin" — role labels
  if (ACTOR_ROLE_RE.test(n)) return true;
  if (/\b(admin|manager)\b/i.test(n) && n.split(/\s+/).length <= 3) {
    if (!/(request|record|document|contract|department|profile|attendance|leave|report)/i.test(n)) {
      return true;
    }
  }
  return false;
}

function looksLikeFrCopiedInterface(name, frNames) {
  const n = normName(name);
  if (!n) return true;
  if (frNames.has(n)) return true;
  if (n.length > 60 && FR_ACTION_RE.test(name)) return true;
  if (FR_ACTION_RE.test(name) && !INTEGRATION_RE.test(name)) return true;
  return false;
}

function filterDataEntities(rows, pack, input) {
  const ban = actorBanSet(pack, input);
  const out = [];
  const seen = new Set();
  for (const row of asArray(rows)) {
    const name = String(row.name || row.title || row.entityName || '').trim();
    if (!name) continue;
    if (looksLikeActorEntity(name, ban)) continue;
    const key = normName(name);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

function filterInterfaces(rows, pack, input) {
  const frNames = frNameSet(pack, input);
  const out = [];
  const seen = new Set();
  for (const row of asArray(rows)) {
    const name = String(row.name || row.title || row.system || '').trim();
    if (!name) continue;
    if (looksLikeFrCopiedInterface(name, frNames)) continue;
    const key = normName(name);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

/**
 * Deterministic interface candidates from FR/NFR/overview signals (when LLM drifts).
 */
function buildDeterministicInterfaces(pack, input) {
  const signals = [];
  const texts = [];
  for (const row of asArray(input?.frSlim || pack?.functionalRequirements)) {
    texts.push(`${row.id || ''} ${row.name || row.title || ''}`);
  }
  for (const row of asArray(input?.nfrSlim || pack?.nonFunctionalRequirements)) {
    texts.push(`${row.id || ''} ${row.category || ''} ${row.statement || ''}`);
  }
  const ov = input?.overview || overviewLite(pack);
  texts.push(`${ov.platform || ''} ${ov.integration || ''} ${ov.existingSystem || ''} ${ov.objective || ''}`);

  const blob = texts.join('\n');
  const push = (id, name, protocol, direction, sourceRefs) => {
    signals.push({ id, name, protocol, direction, sourceRefs });
  };

  if (/excel|csv|nhập hàng loạt|import/i.test(blob)) {
    push('IF-EXCEL', 'Excel/CSV import', 'file', 'inbound', [{ externalId: 'CR-import', sheet: '03_Requirement' }]);
  }
  if (/export|excel|báo cáo|dashboard/i.test(blob)) {
    push('IF-EXPORT', 'Report export (Excel)', 'file', 'outbound', [{ externalId: 'CR-export', sheet: '03_Requirement' }]);
  }
  if (/email|e-?mail|thông báo email|notification/i.test(blob)) {
    push('IF-EMAIL', 'Email notification gateway', 'SMTP/API', 'outbound', [{ externalId: 'CR-notify', sheet: '03_Requirement' }]);
  }
  if (/file|upload|đính kèm|scan|cccd|hđlđ|document/i.test(blob)) {
    push('IF-FILE', 'File/document storage', 'object-store/API', 'bidirectional', [
      { externalId: 'CR-file', sheet: '03_Requirement' },
    ]);
  }
  if (/sso|oauth|ldap|active\s*directory|đăng nhập/i.test(blob)) {
    push('IF-SSO', 'Identity/SSO provider', 'OIDC/SAML', 'inbound', [{ externalId: 'NFR-sec', sheet: '04_NFR' }]);
  }
  if (/api nội bộ|api\b|webhook/i.test(blob) || /api/i.test(String(ov.platform || ''))) {
    push('IF-API', 'Internal REST API', 'HTTPS/REST', 'bidirectional', [{ externalId: 'CTX-platform', sheet: '00_Overview' }]);
  }

  return signals.slice(0, 6);
}

/**
 * Deterministic domain entity seeds from modules + FR noun patterns (LLM drift fallback).
 */
function buildDeterministicEntities(pack, input) {
  const ban = actorBanSet(pack, input);
  const byName = new Map();

  const add = (name, attrs, sourceRefs) => {
    const clean = String(name || '').trim();
    if (!clean || looksLikeActorEntity(clean, ban)) return;
    const key = normName(clean);
    if (byName.has(key)) return;
    byName.set(key, {
      id: `ENT-${byName.size + 1}`,
      name: clean,
      attributes: attrs,
      sourceRefs,
    });
  };

  const moduleMap = {
    'hồ sơ nhân viên': ['Employee', 'EmployeeDocument', 'EmploymentContract'],
    'phòng ban': ['Department', 'Position'],
    'cơ cấu': ['Department', 'Position'],
    'chấm công': ['AttendanceRecord'],
    'nghỉ phép': ['LeaveRequest', 'LeaveBalance'],
    'phân quyền': ['Role', 'Permission'],
    'báo cáo': ['HrReport'],
  };

  for (const row of asArray(input?.frSlim || pack?.functionalRequirements)) {
    const mod = String(row.module || '').toLowerCase();
    const refs = row.id ? [{ externalId: row.id, sheet: '03_Requirement' }] : [];
    for (const [key, ents] of Object.entries(moduleMap)) {
      if (mod.includes(key)) {
        for (const e of ents) add(e, hintAttrs(e), refs);
      }
    }
    const name = String(row.name || row.title || '');
    if (/hồ sơ|nhân viên|employee/i.test(name)) add('Employee', ['employeeCode', 'fullName', 'status'], refs);
    if (/phòng ban|department/i.test(name)) add('Department', ['name', 'code', 'parentId'], refs);
    if (/vị trí|chức danh|position/i.test(name)) add('Position', ['title', 'departmentId'], refs);
    if (/chấm công|attendance|công/i.test(name)) add('AttendanceRecord', ['date', 'employeeId', 'status'], refs);
    if (/nghỉ|leave|phép/i.test(name)) add('LeaveRequest', ['type', 'from', 'to', 'status'], refs);
    if (/hợp đồng|contract/i.test(name)) add('EmploymentContract', ['type', 'startDate', 'endDate'], refs);
    if (/tài liệu|file|document|cccd/i.test(name)) add('EmployeeDocument', ['type', 'fileRef'], refs);
    if (/thông báo|notification|email/i.test(name)) add('Notification', ['channel', 'payload', 'status'], refs);
  }

  return [...byName.values()].slice(0, 10);
}

function hintAttrs(entityName) {
  const map = {
    Employee: ['employeeCode', 'fullName', 'status', 'departmentId'],
    Department: ['name', 'code', 'parentId'],
    Position: ['title', 'departmentId'],
    AttendanceRecord: ['date', 'employeeId', 'checkIn', 'checkOut'],
    LeaveRequest: ['type', 'from', 'to', 'status', 'approverId'],
    LeaveBalance: ['employeeId', 'type', 'remaining'],
    EmploymentContract: ['type', 'startDate', 'endDate'],
    EmployeeDocument: ['type', 'fileRef', 'employeeId'],
    Role: ['name', 'permissions'],
    Permission: ['key', 'scope'],
    HrReport: ['type', 'filters', 'exportedAt'],
    Notification: ['channel', 'payload', 'status'],
  };
  return map[entityName] || ['id', 'name'];
}

function overviewLite(pack) {
  const ov = pack?.overview && typeof pack.overview === 'object' ? pack.overview : {};
  return {
    platform: ov.platform || '',
    integration: ov.integration || '',
    existingSystem: ov.existingSystem || '',
    objective: ov.projectObjective || '',
    expectedUsers: ov.expectedUsers || ov.targetUsers || '',
  };
}

function resolveFrModule(row) {
  return (
    String(
      row?.module ||
        row?.moduleLabel ||
        row?.feature ||
        row?.functional_scope ||
        row?.functionalScope ||
        row?.area ||
        row?.category ||
        ''
    ).trim() || 'General'
  );
}

function frRowsForGrounding(pack, input) {
  const fromInput = asArray(input?.frSlim);
  if (fromInput.length) {
    return fromInput.map((r) => ({
      id: String(r.id || '').trim(),
      name: String(r.name || r.title || '').trim(),
      module: resolveFrModule(r),
      actor: String(r.actor || r.primaryActor || '').trim(),
    }));
  }
  const fromProposal = asArray(input?.proposal?.generated?.functionalRequirements?.items);
  const fromPack = asArray(pack?.functionalRequirements);
  return [...fromProposal, ...fromPack].map((r) => ({
    id: String(r.externalId || r.logicalId || r.id || '').trim(),
    name: String(r.name || r.title || '').trim(),
    module: resolveFrModule(r),
    actor: String(r.actor || r.primaryActor || '').trim(),
  })).filter((r) => r.id || r.name);
}

/** Use-cases from FR modules; if one module, chunk FRs into several UCs. */
function buildDeterministicUseCases(pack, input) {
  const rows = frRowsForGrounding(pack, input);
  const byMod = new Map();
  for (const row of rows) {
    const mod = row.module || 'General';
    if (!byMod.has(mod)) {
      byMod.set(mod, { module: mod, frs: [], actors: {} });
    }
    const g = byMod.get(mod);
    g.frs.push(row);
    const a = row.actor || 'User';
    g.actors[a] = (g.actors[a] || 0) + 1;
  }

  const groups = [...byMod.values()];
  // Single-module packs: split into chunks so grounded-first still beats LLM.
  if (groups.length === 1 && groups[0].frs.length > 4) {
    const only = groups[0];
    const chunked = [];
    for (let i = 0; i < only.frs.length && chunked.length < 6; i += 4) {
      const frs = only.frs.slice(i, i + 4);
      chunked.push({
        module: `${only.module} (${chunked.length + 1})`,
        frs,
        actors: only.actors,
      });
    }
    groups.splice(0, groups.length, ...chunked);
  }

  const out = [];
  let i = 0;
  for (const g of groups) {
    if (out.length >= 6) break;
    i += 1;
    const actor =
      Object.entries(g.actors).sort((a, b) => b[1] - a[1])[0]?.[0] || 'User';
    const primary = g.frs[0];
    out.push({
      id: `UC-${i}`,
      name: `${g.module}: ${String(primary?.name || g.module).slice(0, 80)}`,
      primaryActor: actor,
      goal: String(primary?.name || g.module).slice(0, 160),
      sourceRefs: g.frs.slice(0, 4).map((f) => ({
        externalId: f.id,
        sheet: '03_Requirement',
      })).filter((r) => r.externalId),
    });
  }
  return out;
}

/** Processes from modules; if one module, chunk FRs into several processes. */
function buildDeterministicProcesses(pack, input) {
  const rows = frRowsForGrounding(pack, input);
  const byMod = new Map();
  for (const row of rows) {
    const mod = row.module || 'General';
    if (!byMod.has(mod)) byMod.set(mod, []);
    byMod.get(mod).push(row);
  }
  let groups = [...byMod.entries()];
  if (groups.length === 1 && groups[0][1].length > 4) {
    const [mod, frs] = groups[0];
    groups = [];
    for (let i = 0; i < frs.length && groups.length < 5; i += 4) {
      groups.push([`${mod} (${groups.length + 1})`, frs.slice(i, i + 4)]);
    }
  }
  const out = [];
  let i = 0;
  for (const [mod, frs] of groups) {
    if (out.length >= 5) break;
    i += 1;
    out.push({
      id: `BPM-${i}`,
      name: `Quy trình ${mod}`,
      steps: frs.slice(0, 4).map((f) => String(f.name || '').slice(0, 80)).filter(Boolean),
      actors: [...new Set(frs.map((f) => f.actor).filter(Boolean))].slice(0, 4),
      sourceRefs: frs.slice(0, 4).map((f) => ({
        externalId: f.id,
        sheet: '03_Requirement',
      })).filter((r) => r.externalId),
    });
  }
  return out;
}

/**
 * Apply section-specific quality pass. May replace empty/bad LLM rows with grounded seeds.
 * @returns {{ rows: object[], quality: { filtered: number, seeded: boolean, reason: string|null } }}
 */
function applySectionDeriveQuality(engineId, rows, pack, input) {
  const id = String(engineId || '').toLowerCase();
  if (id === 'data') {
    const filtered = filterDataEntities(rows, pack, input);
    if (filtered.length >= 2) {
      return {
        rows: filtered,
        quality: { filtered: asArray(rows).length - filtered.length, seeded: false, reason: null },
      };
    }
    const seeded = buildDeterministicEntities(pack, input);
    return {
      rows: seeded,
      quality: {
        filtered: asArray(rows).length - filtered.length,
        seeded: true,
        reason: filtered.length ? 'DATA_QUALITY_SEED_TOPUP' : 'DATA_QUALITY_SEED',
      },
    };
  }
  if (id === 'interface') {
    const filtered = filterInterfaces(rows, pack, input);
    if (filtered.length >= 1) {
      return {
        rows: filtered,
        quality: { filtered: asArray(rows).length - filtered.length, seeded: false, reason: null },
      };
    }
    const seeded = buildDeterministicInterfaces(pack, input);
    return {
      rows: seeded,
      quality: {
        filtered: asArray(rows).length - filtered.length,
        seeded: true,
        reason: 'INTERFACE_QUALITY_SEED',
      },
    };
  }
  if (id === 'uc') {
    const existing = asArray(rows).filter((r) => String(r.name || r.title || '').trim());
    if (existing.length >= 3) {
      return { rows: existing, quality: { filtered: 0, seeded: false, reason: null } };
    }
    const seeded = buildDeterministicUseCases(pack, input);
    return {
      rows: seeded,
      quality: { filtered: 0, seeded: true, reason: 'UC_GROUNDED_SEED' },
    };
  }
  if (id === 'bpm') {
    const existing = asArray(rows).filter((r) => String(r.name || r.title || '').trim());
    if (existing.length >= 3) {
      return { rows: existing, quality: { filtered: 0, seeded: false, reason: null } };
    }
    const seeded = buildDeterministicProcesses(pack, input);
    return {
      rows: seeded,
      quality: { filtered: 0, seeded: true, reason: 'BPM_GROUNDED_SEED' },
    };
  }
  return { rows: asArray(rows), quality: { filtered: 0, seeded: false, reason: null } };
}

module.exports = {
  INTEGRATION_RE,
  filterDataEntities,
  filterInterfaces,
  buildDeterministicEntities,
  buildDeterministicInterfaces,
  buildDeterministicUseCases,
  buildDeterministicProcesses,
  applySectionDeriveQuality,
  looksLikeActorEntity,
  looksLikeFrCopiedInterface,
};
