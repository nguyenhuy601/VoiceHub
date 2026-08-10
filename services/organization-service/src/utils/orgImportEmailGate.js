/**
 * Chặn Excel re-import email đã thuộc org / đang invite — tránh đốt VH-xxx.
 * Cùng ý inviteMember: searchUserByEmail + Membership.
 */
const Membership = require('../models/Membership');
const CompanyInvite = require('../models/CompanyInvite');
const { searchUserByEmail } = require('../clients/userLookup.client');
const { runWithConcurrency } = require('./runWithConcurrency');

const LOOKUP_CONCURRENCY = 8;

/**
 * @param {Array<{ rowNumber?: number, email?: string }>} rows
 * @param {Set<string>} memberEmails
 * @param {Set<string>} pendingInviteEmails
 * @returns {Array<{ rowNumber: number, message: string, errorCode: string }>}
 */
function buildEmailConflictDetails(rows, memberEmails, pendingInviteEmails) {
  const members = memberEmails instanceof Set ? memberEmails : new Set();
  const pending = pendingInviteEmails instanceof Set ? pendingInviteEmails : new Set();
  const details = [];
  for (const r of rows || []) {
    const email = String(r?.email || '')
      .trim()
      .toLowerCase();
    if (!email) continue;
    if (members.has(email)) {
      details.push({
        rowNumber: r.rowNumber || 0,
        message: `Email đã là thành viên công ty: ${email}. Không import lại (tránh đốt mã NV).`,
        errorCode: 'VALIDATION_EMAIL_ALREADY_MEMBER',
      });
      continue;
    }
    if (pending.has(email)) {
      details.push({
        rowNumber: r.rowNumber || 0,
        message: `Email đang có lời mời chờ chấp nhận: ${email}. Huỷ/đợi invite hoặc dùng email khác.`,
        errorCode: 'VALIDATION_EMAIL_PENDING_INVITE',
      });
    }
  }
  return details;
}

/**
 * @param {string} organizationId
 * @param {Array<{ rowNumber?: number, email?: string }>} rows
 * @returns {Promise<Array<{ rowNumber: number, message: string, errorCode: string }>>}
 */
async function findEmailOrgConflicts(organizationId, rows) {
  const list = Array.isArray(rows) ? rows : [];
  const emails = [
    ...new Set(
      list
        .map((r) =>
          String(r?.email || '')
            .trim()
            .toLowerCase()
        )
        .filter(Boolean)
    ),
  ];
  if (!organizationId || !emails.length) return [];

  const pendingInvites = await CompanyInvite.find({
    organization: organizationId,
    status: 'pending',
    email: { $in: emails },
  })
    .select('email')
    .lean();
  const pendingInviteEmails = new Set(
    (pendingInvites || [])
      .map((i) =>
        String(i.email || '')
          .trim()
          .toLowerCase()
      )
      .filter(Boolean)
  );

  const memberEmails = new Set();
  await runWithConcurrency(emails, LOOKUP_CONCURRENCY, async (email) => {
    if (pendingInviteEmails.has(email)) return;
    let profile;
    try {
      profile = await searchUserByEmail(email);
    } catch {
      return;
    }
    if (!profile) return;
    const userId = String(profile.userId || profile.id || profile._id || '').trim();
    if (!userId) return;
    const membership = await Membership.findOne({
      user: userId,
      organization: organizationId,
      status: { $in: ['active', 'pending', 'suspended'] },
    })
      .select('_id')
      .lean();
    if (membership) memberEmails.add(email);
  });

  return buildEmailConflictDetails(list, memberEmails, pendingInviteEmails);
}

module.exports = {
  buildEmailConflictDetails,
  findEmailOrgConflicts,
};
