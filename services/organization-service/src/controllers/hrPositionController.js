const HrPositionCatalog = require('../models/HrPositionCatalog');
const { orgValidation, orgCatch, orgFail } = require('../utils/orgApiError');
const { toObjectId } = require('../utils/orgAccess');
const {
  isMasterDataV1Enabled,
  MASTER_POSITIONS,
  resolveCanonicalPositionKey,
  getPositionByKey,
} = require('@enterprise/shared/config/masterData');
const {
  getEnabledPositionKeys,
  ensureOrgMasterDataSeed,
} = require('../services/orgMasterData.service');

function normalizeTitle(raw) {
  return String(raw || '').trim().replace(/\s+/g, ' ');
}

async function listCatalog(req, res) {
  try {
    const organizationId = String(req.params.orgId || '').trim();
    if (!organizationId) return orgValidation(res, 'organizationId bắt buộc');
    const oid = toObjectId(organizationId);

    if (isMasterDataV1Enabled()) {
      await ensureOrgMasterDataSeed(organizationId);
      const enabledKeys = await getEnabledPositionKeys(organizationId);
      const enabledSet = new Set(enabledKeys);
      const positions = MASTER_POSITIONS.filter((p) => enabledSet.has(p.key)).map((p) => ({
        key: p.key,
        title: p.label,
        sortOrder: p.sortOrder,
      }));
      return res.json({ success: true, data: { positions } });
    }

    const positions = await HrPositionCatalog.find({ organizationId: oid, isActive: true })
      .sort({ sortOrder: 1, createdAt: 1 })
      .select('title sortOrder')
      .lean();

    return res.json({ success: true, data: { positions } });
  } catch (error) {
    return orgCatch(res, error);
  }
}

async function createCatalog(req, res) {
  try {
    const organizationId = String(req.params.orgId || '').trim();
    if (!organizationId) return orgValidation(res, 'organizationId bắt buộc');

    if (isMasterDataV1Enabled()) {
      const { key, title } = req.body || {};
      const positionKey = resolveCanonicalPositionKey(key || title);
      const master = getPositionByKey(positionKey);
      if (!master) {
        return orgValidation(res, 'Position key không hợp lệ — chọn từ master catalog.');
      }
      const enabledKeys = await getEnabledPositionKeys(organizationId);
      if (!enabledKeys.includes(master.key)) {
        return orgFail(
          res,
          403,
          'Position chưa được bật trong Master Data của tổ chức.',
          'MASTER_DATA_POSITION_DISABLED'
        );
      }
      return res.status(201).json({
        success: true,
        data: { position: { key: master.key, title: master.label } },
      });
    }

    const { title } = req.body || {};

    const normalizedTitle = normalizeTitle(title);
    if (!normalizedTitle) return orgValidation(res, 'title là bắt buộc');

    const oid = toObjectId(organizationId);
    const normalizedKey = normalizedTitle.toLowerCase();

    const existing = await HrPositionCatalog.findOne({
      organizationId: oid,
      normalizedTitle: normalizedKey,
    }).lean();

    if (existing) {
      return res.json({
        success: true,
        data: { position: { title: existing.title } },
      });
    }

    const lastRows = await HrPositionCatalog.find({ organizationId: oid })
      .sort({ sortOrder: -1 })
      .select('sortOrder')
      .limit(1)
      .lean();

    const lastRow = lastRows?.[0] || null;
    const nextSortOrder = Number(lastRow?.sortOrder) > -Infinity ? Number(lastRow?.sortOrder || 0) + 10 : 100;

    const row = await HrPositionCatalog.create({
      organizationId: oid,
      title: normalizedTitle,
      normalizedTitle: normalizedKey,
      sortOrder: nextSortOrder,
      isActive: true,
    });

    return res.status(201).json({ success: true, data: { position: { title: row.title } } });
  } catch (error) {
    if (String(error?.code || '').includes('E11000')) {
      const oid = toObjectId(organizationId);
      const normalizedKey = normalizeTitle(title).toLowerCase();
      const existing = await HrPositionCatalog.findOne({
        organizationId: oid,
        normalizedTitle: normalizedKey,
      }).lean();
      if (existing) {
        return res.json({
          success: true,
          data: { position: { title: existing.title } },
        });
      }
      return orgCatch(res, error, 400, 'Không thể tạo position');
    }
    return orgCatch(res, error, 400, 'Không thể tạo position');
  }
}

module.exports = {
  listCatalog,
  createCatalog,
};
