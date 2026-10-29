/**
 * Golden fixture — Customer Raw "VAI TRÒ" (eval only; not committed customer data).
 */

const ROLE_PROSE = [
  'VAI TRÒ. Hiển thị cảnh báo khi tạo trùng',
  'Thêm vai trò :',
  'Form điền thông tin : Nhập Tên vai trò , Ghi Chú , Nhập Phần trăm hoa hồng , Nhập Lương Cố Định ,',
  'Lương Nhiệm Vụ (Nội dung , Tình Trạng (Đạt / Chưa Đạt / Khác ) , Mốc (Số tiền) , Tỉ lệ (Phần Trăm), Số lượng ,',
  'Lương = Số lượng x Tỉ lệ x Mốc) , KPI.',
  'Xoá , sửa.',
  'Hiển thị danh sách :STT (Tự động tăng) ,Tên vai trò  , Lương Cố Định , Phần trăm hoa hồng ,',
  'Lương Nhiệm Vụ , KPI , Ghi chú , thao tác.',
].join('\n');

/** Expected functional behaviors (golden oracle for coverage scoring). */
const GOLDEN_BEHAVIORS = Object.freeze([
  { key: 'dup_warning', label: 'Cảnh báo trùng tên', re: /trùng|cảnh\s*báo|duplicate/i },
  { key: 'add_role', label: 'Thêm vai trò / form', re: /thêm|tạo.*vai\s*trò|form/i },
  { key: 'task_salary', label: 'Lương nhiệm vụ', re: /lương\s*nhiệm\s*vụ|nhiệm\s*vụ/i },
  { key: 'formula', label: 'Công thức SL×Tỉ lệ×Mốc', re: /số\s*lượng.*t[ỉi]\s*l[ệe].*m[ốo]c|×|\*/i },
  { key: 'list_view', label: 'Danh sách / STT', re: /danh\s*sách|STT|hiển\s*thị/i },
  { key: 'edit', label: 'Sửa', re: /sửa|chỉnh\s*sửa/i },
  { key: 'delete', label: 'Xóa', re: /xoá|xóa|delete/i },
  { key: 'kpi', label: 'KPI', re: /\bKPI\b/i },
  { key: 'commission', label: 'Hoa hồng', re: /hoa\s*hồng|commission/i },
  { key: 'fixed_salary', label: 'Lương cố định', re: /lương\s*cố\s*định/i },
]);

function customerRawShell(overrides = {}) {
  return {
    overview: {
      requirementName: 'Quản lý vai trò CRM',
      projectObjective: 'Cấu hình vai trò, lương và KPI',
      businessScope: 'Module Vai trò',
      ...overrides.overview,
    },
    aiAnalysis: {
      formValidation: { ok: true, recognizedAsCustomerRaw: true, templateType: 'customerRaw' },
      customerRawRows: { businessRequests: overrides.businessRequests || [] },
      workbookDiagnostic: { intakeKind: 'customer_raw' },
    },
    snapshotId: 'eval-snapshot-vai-tro',
    packId: 'eval-pack-vai-tro',
  };
}

/** One Excel row → one FR (as-is import rule). */
function buildMonolithicFrPack() {
  const base = customerRawShell();
  return {
    ...base,
    functionalRequirements: [
      {
        externalId: 'CR-ROLE-01',
        level: 'Requirement',
        name: ROLE_PROSE.slice(0, 500),
        description: ROLE_PROSE,
        moduleLabel: 'Vai trò',
        actor: 'Admin',
        acceptanceCriteria: '',
        priority: 'Medium',
      },
    ],
  };
}

/** Golden 6-FR decomposition (oracle — not produced by current pipeline). */
function buildGoldenSixFrPack() {
  const base = customerRawShell();
  const frs = [
    {
      externalId: 'CR-ROLE-01',
      name: 'Phát hiện vai trò trùng tên',
      description: 'Hiển thị cảnh báo khi tạo trùng. Chưa rõ: chặn lưu, hoa/thường.',
      moduleLabel: 'Vai trò',
      actor: 'Admin',
    },
    {
      externalId: 'CR-ROLE-02',
      name: 'Thêm vai trò',
      description:
        'Form: Tên vai trò, Ghi chú, Phần trăm hoa hồng, Lương cố định, KPI.',
      moduleLabel: 'Vai trò',
      actor: 'Admin',
    },
    {
      externalId: 'CR-ROLE-03',
      name: 'Cấu hình lương nhiệm vụ',
      description:
        'Nội dung, Tình trạng (Đạt/Chưa Đạt/Khác), Mốc, Tỉ lệ, Số lượng. Lương = Số lượng x Tỉ lệ x Mốc.',
      moduleLabel: 'Vai trò',
      actor: 'Admin',
    },
    {
      externalId: 'CR-ROLE-04',
      name: 'Xem danh sách vai trò',
      description:
        'STT tự tăng, Tên, Lương cố định, Hoa hồng, Lương nhiệm vụ, KPI, Ghi chú, Thao tác.',
      moduleLabel: 'Vai trò',
      actor: 'Admin',
    },
    {
      externalId: 'CR-ROLE-05',
      name: 'Sửa vai trò',
      description: 'Sửa thông tin vai trò và cấu hình liên quan.',
      moduleLabel: 'Vai trò',
      actor: 'Admin',
    },
    {
      externalId: 'CR-ROLE-06',
      name: 'Xóa vai trò',
      description: 'Xóa vai trò. Chưa rõ: soft delete, điều kiện khi đang dùng.',
      moduleLabel: 'Vai trò',
      actor: 'Admin',
    },
  ];
  return {
    ...base,
    functionalRequirements: frs.map((r) => ({ ...r, level: 'Requirement', priority: 'Medium' })),
  };
}

function planningEnvFromProcess() {
  return {
    ...process.env,
    AI_PLANNING_LLM: '1',
    PHASE1_RAW_SECTION_DERIVE: '1',
    PHASE1_RAW_DERIVE_SECTIONS: 'bg,br,uc,bpm,data,nfr,scope',
    PHASE1_UC_GROUNDED_FIRST: '0',
    PHASE1_BPM_GROUNDED_FIRST: '0',
    PHASE1_DATA_GROUNDED_FIRST: '0',
    PHASE1_INTERFACE_GROUNDED_FIRST: '0',
    RAG_MODE: 'stub',
  };
}

module.exports = {
  ROLE_PROSE,
  GOLDEN_BEHAVIORS,
  buildMonolithicFrPack,
  buildGoldenSixFrPack,
  planningEnvFromProcess,
};
