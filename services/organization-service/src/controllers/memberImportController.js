const XLSX = require('xlsx');
const ImportBatch = require('../models/ImportBatch');
const {
  importMembersExcel,
  previewMembersExcel,
  confirmMembersExcel,
} = require('../services/resourceImport.service');
const { resolveFrontendUrl } = require('@enterprise/shared');

function ensureJson(res, status, payload) {
  return res.status(status).json(payload);
}

function unwrapApiError(err) {
  return {
    statusCode: err?.statusCode || err?.status || 400,
    errorCode: err?.errorCode || 'RESOURCE_IMPORT_FAILED',
    message: err?.message || 'Import failed',
    details: err?.details || null,
  };
}

async function makeTemplateWorkbook() {
  const headers = [
    'employeeCode',
    'fullName',
    'email',
    'phone',
    'departmentCode',
    'jobTitle',
    'primaryDomain',
    'skills',
    'yearsExperience',
    'maxConcurrentProjects',
    'orgRole',
  ];

  // employeeCode trống = auto VH-xxx; departmentCode = đúng tên phòng trên org
  const example = [
    '',
    'Nguyễn An',
    'an.nguyen@company.com',
    '',
    'Backend',
    'Junior Backend',
    'be',
    'NodeJS,MongoDB',
    1,
    2,
    'member',
  ];

  const notes = [
    ['Ghi chú template Excel HR (VoiceHub)'],
    [
      'employeeCode',
      'CHUẨN: ĐỂ TRỐNG → hệ thống cấp VH-001… (cùng counter mời tay). Chỉ điền khi migrate; trùng → hủy cả file. CẤM NV001.',
    ],
    [
      'departmentCode',
      'Bắt buộc — trùng ĐÚNG tên phòng đã có trên công ty (vd Backend, Front End). Sai tên → Preview báo lỗi.',
    ],
    ['fullName', 'Bắt buộc — họ tên đầy đủ.'],
    ['email', 'Bắt buộc — mail NV. Domain phải thuộc allowlist công ty (nếu đã cấu hình).'],
    ['phone', 'Tùy chọn. Để trống hoặc SĐT VN 10 số. Tránh trùng số đã có.'],
    ['jobTitle', 'Bắt buộc — chức danh HR (không phải Project Role).'],
    ['primaryDomain', 'Bắt buộc: fe | be | fullstack | mobile | qa | ba | devops | other'],
    ['skills', 'Bắt buộc — tách bằng dấu phẩy hoặc ;'],
    ['yearsExperience', 'Bắt buộc — số ≥ 0'],
    [
      'maxConcurrentProjects',
      'Công suất dự án song song (1–20). Trống = 2. Soft OT khi gán project vượt mức.',
    ],
    ['orgRole', 'member | hr | admin. Trống = member. CẤM owner. Không phải gói RBAC.'],
    ['System Role / Gói quyền', 'KHÔNG có cột — gán sau ở phân quyền.'],
    ['Responsibility', 'KHÔNG có cột — soft-map từ primaryDomain sau import.'],
    [
      'Luồng UI',
      'Upload → Preview (máy quét lỗi) → HR xem → Confirm (ghi theo lô 50, concurrency có trần).',
    ],
    ['Strict', 'Thiếu / sai 1 dòng → Preview fail, không Confirm.'],
    ['Giới hạn', 'Tối đa ~200 dòng/file. Confirm ghi tối đa 50/lô.'],
  ];

  const ws = XLSX.utils.aoa_to_sheet([headers, example]);
  const wsNotes = XLSX.utils.aoa_to_sheet(notes);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'resource_import');
  XLSX.utils.book_append_sheet(wb, wsNotes, 'README');
  return wb;
}

class MemberImportController {
  async importExcel(req, res) {
    try {
      const orgId = req.params.orgId;
      const uploadedBy = req.user?.id || req.user?.userId || req.user?._id || null;

      if (!req.file?.buffer) {
        return ensureJson(res, 400, {
          success: false,
          message: 'file (.xlsx) bắt buộc',
          errorCode: 'RESOURCE_IMPORT_FILE_REQUIRED',
        });
      }
      if (!orgId) {
        return ensureJson(res, 400, {
          success: false,
          message: 'orgId bắt buộc',
          errorCode: 'VALIDATION_REQUIRED',
        });
      }

      const out = await importMembersExcel({
        organizationId: orgId,
        uploadedBy,
        fileBuffer: req.file.buffer,
        fileName: req.file.originalname || '',
        frontendUrl: resolveFrontendUrl(req).replace(/\/+$/, ''),
      });

      return ensureJson(res, 201, { success: true, data: out });
    } catch (err) {
      const e = unwrapApiError(err);
      return ensureJson(res, e.statusCode, {
        success: false,
        message: e.message,
        errorCode: e.errorCode,
        ...(e.details ? { details: e.details } : {}),
      });
    }
  }

  async previewExcel(req, res) {
    try {
      const orgId = req.params.orgId;
      const uploadedBy = req.user?.id || req.user?.userId || req.user?._id || null;

      if (!req.file?.buffer) {
        return ensureJson(res, 400, {
          success: false,
          message: 'file (.xlsx) bắt buộc',
          errorCode: 'RESOURCE_IMPORT_FILE_REQUIRED',
        });
      }
      if (!orgId) {
        return ensureJson(res, 400, {
          success: false,
          message: 'orgId bắt buộc',
          errorCode: 'VALIDATION_REQUIRED',
        });
      }

      const out = await previewMembersExcel({
        organizationId: orgId,
        uploadedBy,
        fileBuffer: req.file.buffer,
        fileName: req.file.originalname || '',
      });

      return ensureJson(res, 200, { success: true, data: out });
    } catch (err) {
      const e = unwrapApiError(err);
      return ensureJson(res, e.statusCode, {
        success: false,
        message: e.message,
        errorCode: e.errorCode,
        ...(e.details ? { details: e.details } : {}),
      });
    }
  }

  async confirmExcel(req, res) {
    try {
      const orgId = req.params.orgId;
      const uploadedBy = req.user?.id || req.user?.userId || req.user?._id || null;
      const batchId = String(req.body?.batchId || req.body?.draftId || '').trim();

      if (!orgId) {
        return ensureJson(res, 400, {
          success: false,
          message: 'orgId bắt buộc',
          errorCode: 'VALIDATION_REQUIRED',
        });
      }
      if (!batchId) {
        return ensureJson(res, 400, {
          success: false,
          message: 'batchId bắt buộc',
          errorCode: 'VALIDATION_REQUIRED',
        });
      }

      const out = await confirmMembersExcel({
        organizationId: orgId,
        uploadedBy,
        batchId,
        frontendUrl: resolveFrontendUrl(req).replace(/\/+$/, ''),
      });

      const statusCode = out?.async ? 202 : 201;
      return ensureJson(res, statusCode, { success: true, data: out });
    } catch (err) {
      const e = unwrapApiError(err);
      return ensureJson(res, e.statusCode, {
        success: false,
        message: e.message,
        errorCode: e.errorCode,
        ...(e.details ? { details: e.details } : {}),
      });
    }
  }

  async getBatchStatus(req, res) {
    try {
      const orgId = req.params.orgId;
      const { batchId } = req.params;
      if (!batchId) return ensureJson(res, 400, { success: false, message: 'batchId bắt buộc' });

      const batch = await ImportBatch.findOne({ _id: batchId, organizationId: orgId }).lean();
      if (!batch) {
        return ensureJson(res, 404, { success: false, message: 'Batch không tồn tại' });
      }

      // Không trả previewPayload lớn ra client (chỉ metadata + rows)
      const { previewPayload, ...safe } = batch;
      return ensureJson(res, 200, {
        success: true,
        data: {
          ...safe,
          canConfirm: safe.status === 'preview' && Number(safe.errorCount || 0) === 0,
        },
      });
    } catch (err) {
      return ensureJson(res, 400, { success: false, message: err?.message || 'Batch status failed' });
    }
  }

  async downloadTemplate(req, res) {
    try {
      const wb = await makeTemplateWorkbook();
      const out = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="resource_import.xlsx"');
      return res.status(200).send(out);
    } catch (err) {
      return ensureJson(res, 500, { success: false, message: 'Không thể tạo template' });
    }
  }
}

module.exports = new MemberImportController();
