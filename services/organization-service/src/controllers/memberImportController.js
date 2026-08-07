const XLSX = require('xlsx');
const ImportBatch = require('../models/ImportBatch');
const { importMembersExcel } = require('../services/resourceImport.service');
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

  // Example: employeeCode trống = auto VH-xxx; departmentCode = exact Department.name
  const example = [
    '',
    'Yến Bình',
    'binh.yen@voicehub.net',
    '',
    'Phòng Phát triển',
    'Business Analyst',
    'ba',
    'Agile/Scrum,Jira',
    3,
    2,
    'member',
  ];

  const notes = [
    ['Ghi chú template Excel HR'],
    [
      'employeeCode',
      'Chuẩn: ĐỂ TRỐNG → hệ thống cấp VH-001… liên tục (cùng mời tay). Chỉ điền khi migrate; trùng file/hệ thống/invite pending → hủy cả file. Không dùng NV001.',
    ],
    ['departmentCode', 'Phải trùng đúng tên phòng đã có trong công ty (vd: Phòng Phát triển).'],
    ['orgRole', 'member | hr | admin. Để trống = member. CẤM owner.'],
    ['phone', 'Tùy chọn. Tránh trùng số đã có trên hệ thống (unique phoneBlindIndex).'],
    ['email', 'Mail thật của NV. Domain phải thuộc allowlist công ty (nếu đã cấu hình).'],
    ['Sau import', 'Hệ thống gửi email đặt mật khẩu (không gửi plaintext password).'],
    ['jobTitle', 'Chức danh HR — không phải quyền dự án (Project Role).'],
    ['System Role', 'Không nằm trong Excel — gán sau ở RBAC / Gói quyền.'],
    [
      'primaryDomain',
      'fe | be | qa | ba | devops | mobile | other … Soft-map → Responsibility (be→backend, fe→frontend, ba→product). Không phải cột Responsibility riêng.',
    ],
    ['skills', 'Danh sách skill cách nhau bằng dấu phẩy.'],
    ['Strict', 'Thiếu / sai 1 dòng → hủy cả file import.'],
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

  async getBatchStatus(req, res) {
    try {
      const orgId = req.params.orgId;
      const { batchId } = req.params;
      if (!batchId) return ensureJson(res, 400, { success: false, message: 'batchId bắt buộc' });

      const batch = await ImportBatch.findOne({ _id: batchId, organizationId: orgId }).lean();
      if (!batch) {
        return ensureJson(res, 404, { success: false, message: 'Batch không tồn tại' });
      }

      return ensureJson(res, 200, { success: true, data: batch });
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

