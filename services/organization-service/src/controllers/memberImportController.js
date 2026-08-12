const ImportBatch = require('../models/ImportBatch');
const {
  importMembersExcel,
  previewMembersExcel,
  confirmMembersExcel,
} = require('../services/resourceImport.service');
const { buildResourceImportTemplateBuffer } = require('../utils/excelImportTemplate');
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
      const orgId = req.params.orgId;
      if (!orgId) {
        return ensureJson(res, 400, { success: false, message: 'orgId bắt buộc' });
      }
      const out = await buildResourceImportTemplateBuffer(orgId);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="resource_import.xlsx"');
      return res.status(200).send(out);
    } catch (err) {
      return ensureJson(res, 500, { success: false, message: 'Không thể tạo template' });
    }
  }
}

module.exports = new MemberImportController();
