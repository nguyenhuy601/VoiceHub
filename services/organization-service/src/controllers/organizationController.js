const Organization = require('../models/Organization');
const Membership = require('../models/Membership');
const Department = require('../models/Department');
const Channel = require('../models/Channel');
const { emitRealtimeEvent } = require('/shared');
const { ensureDefaultOrgRoles, syncUserOrgRole } = require('../services/rolePermissionOrgSync');
const { purgeOrganizationEverywhere } = require('../services/organizationCascadePurge');

const getUserId = (req) => req.user?.id || req.user?.userId || req.user?._id;
const MAX_OWNED_ORGS_PER_USER = 3;
const RESERVED_SLUGS = new Set(['admin', 'system', 'support', 'api', 'workspace', 'root']);
const DEFAULT_DEPARTMENTS = [
  { name: 'Human Resources', description: 'HR and workplace culture' },
  { name: 'Accounting', description: 'Finance and internal accounting' },
  { name: 'Sales', description: 'Sales and customer growth' },
  { name: 'Operations', description: 'Operations and process optimization' },
];

const buildDefaultChannels = (organizationId, departmentId, ownerId) => [
  {
    name: 'general',
    description: 'Department-wide text chat',
    type: 'chat',
    organization: organizationId,
    department: departmentId,
    leader: ownerId,
  },
  {
    name: 'voice',
    description: 'Department voice channel',
    type: 'voice',
    organization: organizationId,
    department: departmentId,
    leader: ownerId,
  },
];

const seedDefaultStructure = async (organizationId, ownerId) => {
  const departments = await Department.insertMany(
    DEFAULT_DEPARTMENTS.map((department) => ({
      ...department,
      organization: organizationId,
      head: ownerId,
    }))
  );

  const channels = departments.flatMap((department) =>
    buildDefaultChannels(organizationId, department._id, ownerId)
  );

  await Channel.insertMany(channels);
};

const normalizeSlug = (value = '') =>
  String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

exports.getMyOrganizations = async (req, res, next) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ status: 'fail', message: 'Unauthorized' });
    }
    const memberships = await Membership.find({ user: userId, status: 'active' })
      .populate({ path: 'organization', match: { isActive: true } })
      .select('organization role');

    const organizations = memberships
      .filter((membership) => !!membership.organization)
      .map((membership) => ({
        ...membership.organization.toObject(),
        myRole: membership.role,
      }));

    res.json({ status: 'success', data: organizations });
  } catch (error) {
    next(error);
  }
};

exports.createOrganization = async (req, res, next) => {
  try {
    const { name, description, logo, slug, status, type, teamSize, industry } = req.body;
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ status: 'fail', message: 'Unauthorized' });
    }
    const normalizedName = String(name || '').trim();
    if (normalizedName.length < 2) {
      return res.status(400).json({ status: 'fail', message: 'Organization name must be at least 2 characters' });
    }

    const normalizedSlug = normalizeSlug(slug || normalizedName);
    if (normalizedSlug.length < 3) {
      return res.status(400).json({ status: 'fail', message: 'Slug must be at least 3 characters' });
    }
    if (RESERVED_SLUGS.has(normalizedSlug)) {
      return res.status(422).json({ status: 'fail', message: 'Slug is reserved' });
    }

    const ownerCount = await Membership.countDocuments({
      user: userId,
      role: 'owner',
      status: 'active',
    });
    if (ownerCount >= MAX_OWNED_ORGS_PER_USER) {
      return res.status(409).json({
        status: 'fail',
        message: `Owner can create up to ${MAX_OWNED_ORGS_PER_USER} organizations`,
      });
    }

    const slugExists = await Organization.exists({ slug: normalizedSlug });
    if (slugExists) {
      return res.status(409).json({ status: 'fail', message: 'Slug already exists' });
    }

    const organization = await Organization.create({
      name: normalizedName,
      description,
      logo,
      ownerId: userId,
      slug: normalizedSlug,
      status: ['PENDING', 'ACTIVE', 'SUSPENDED', 'ARCHIVED'].includes(status) ? status : 'ACTIVE',
      type: String(type || '').trim(),
      teamSize: String(teamSize || '').trim(),
      industry: String(industry || '').trim(),
    });

    // Auto-add creator as owner
    await Membership.create({
      user: userId,
      organization: organization._id,
      role: 'owner',
      status: 'active',
    });

    // RBAC: tạo 2 role mặc định (Quản trị viên / Thành viên) + gán chủ tổ chức — chạy trước seed phòng ban để không phụ thuộc seed
    await ensureDefaultOrgRoles(organization._id);
    await syncUserOrgRole(userId, organization._id, 'owner');

    // Seed cấu trúc mặc định: phòng ban bắt buộc + 1 chat/1 voice cho mỗi phòng ban
    await seedDefaultStructure(organization._id, userId);

    await emitRealtimeEvent({
      event: 'organization:created',
      userId: String(userId),
      payload: {
        organizationId: String(organization._id),
        name: organization.name,
        timestamp: new Date().toISOString(),
      },
    });

    res.status(201).json({ status: 'success', data: organization });
  } catch (error) {
    next(error);
  }
};

exports.getOrganizationBySlug = async (req, res, next) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ status: 'fail', message: 'Unauthorized' });
    }
    const slug = normalizeSlug(req.params.slug);
    if (!slug) {
      return res.status(400).json({ status: 'fail', message: 'Invalid slug' });
    }
    const organization = await Organization.findOne({ slug, isActive: true });
    if (!organization) {
      return res.status(404).json({ status: 'fail', message: 'Organization not found' });
    }
    const membership = await Membership.findOne({
      user: userId,
      organization: organization._id,
      status: 'active',
    });
    if (!membership) {
      return res.status(403).json({ status: 'fail', message: 'Access denied' });
    }

    res.json({
      status: 'success',
      data: { ...organization.toObject(), myRole: membership.role },
    });
  } catch (error) {
    next(error);
  }
};

exports.getOrganization = async (req, res, next) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ status: 'fail', message: 'Unauthorized' });
    }
    const organization = await Organization.findById(req.params.id);
    if (!organization) {
      return res.status(404).json({ status: 'fail', message: 'Organization not found' });
    }

    // Check membership
    const membership = await Membership.findOne({
      user: userId,
      organization: organization._id,
    });

    if (!membership) {
      return res.status(403).json({ status: 'fail', message: 'Access denied' });
    }

    res.json({ status: 'success', data: { ...organization.toObject(), myRole: membership.role } });
  } catch (error) {
    next(error);
  }
};

exports.updateOrganization = async (req, res, next) => {
  try {
    const { name, description, logo, settings } = req.body;

    const organization = await Organization.findByIdAndUpdate(
      req.params.id,
      { name, description, logo, settings },
      { new: true, runValidators: true }
    );

    await emitRealtimeEvent({
      event: 'organization:updated',
      userId: String(getUserId(req) || ''),
      payload: {
        organizationId: String(req.params.id),
        name: organization?.name,
        timestamp: new Date().toISOString(),
      },
    });

    res.json({ status: 'success', data: organization });
  } catch (error) {
    next(error);
  }
};

exports.deleteOrganization = async (req, res, next) => {
  try {
    const orgId = req.params.id;
    const userId = getUserId(req);
    const organization = await Organization.findById(orgId);
    if (!organization) {
      return res.status(404).json({ status: 'fail', message: 'Organization not found' });
    }
    if (String(organization.ownerId) !== String(userId)) {
      return res.status(403).json({ status: 'fail', message: 'Only the organization owner can delete the organization' });
    }

    await purgeOrganizationEverywhere(orgId);

    await emitRealtimeEvent({
      event: 'organization:deleted',
      userId: String(userId || ''),
      payload: {
        organizationId: String(orgId),
        timestamp: new Date().toISOString(),
      },
    });
    res.json({ status: 'success', message: 'Organization and related data have been removed' });
  } catch (error) {
    next(error);
  }
};

/** Kênh (roomId tin nhắn) mà user được phép xem trong tổ chức — dùng cho chat-service search. */
exports.getAccessibleChannelIds = async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const { orgId } = req.params;
    if (!userId) {
      return res.status(401).json({ status: 'fail', message: 'Unauthorized' });
    }
    const membership = await Membership.findOne({
      user: userId,
      organization: orgId,
      status: 'active',
    });
    if (!membership) {
      return res.status(403).json({ status: 'fail', message: 'Access denied' });
    }
    const channels = await Channel.find({ organization: orgId, isActive: true }).select('_id members').lean();
    const uid = String(userId);
    const channelIds = channels
      .filter((ch) => {
        if (!ch.members || ch.members.length === 0) return true;
        return ch.members.some((m) => String(m) === uid || String(m?._id || m) === uid);
      })
      .map((ch) => String(ch._id));
    res.json({ status: 'success', data: { channelIds } });
  } catch (error) {
    next(error);
  }
};
