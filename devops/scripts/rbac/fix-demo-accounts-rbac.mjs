#!/usr/bin/env node
/**
 * Step 6 — cập nhật bản ghi Mongo/Atlas THẬT (không mock user, không đổi schema).
 *
 * Quan trọng: auth_db có thể có NHIỀU userauths cùng email. Script ưu tiên JWT userId
 * đã xác nhận bằng login smoke (map JWT_USER_IDS).
 *
 * SoT vai tổ chức: userorgrolegrants + organizationalroles.code
 *
 * Usage:
 *   node devops/scripts/rbac/fix-demo-accounts-rbac.mjs --dry-run
 *   node devops/scripts/rbac/fix-demo-accounts-rbac.mjs --apply
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../..');
const DRY = !process.argv.includes('--apply');
const require = createRequire(path.join(ROOT, 'services/organization-service/package.json'));

const ORG_ID = '6a55d5f0888221ae1fca4fcf';
const STANDARD_PASSWORD = 'Admin@123456';

/** JWT userId đã xác nhận bằng POST /api/auth/login */
const JWT_USER_IDS = {
  'danh.owner@voicehub.local': '6a50cf89118b7faac2f6adf0',
  'nv.pm01@voicehub.local': '6a7a011b41d07983f6331de8',
  'nv.fe02@voicehub.local': '6a7a011941d07983f6331dbb',
  'nv.be.lead@voicehub.local': '6a7a011941d07983f6331da6',
  'nv.fe.lead@voicehub.local': '6a7a011941d07983f6331db2',
  'admin@voicehub.local': '6a4e099a135b2ab99925eb17',
};

const ORG_ROLE_TARGETS = {
  'nv.pm01@voicehub.local': ['RESOURCE_MANAGER', 'IT_ADMIN'],
  'nv.be.lead@voicehub.local': ['DIRECTOR'],
  'nv.fe.lead@voicehub.local': ['HR_APPROVER'],
  'nv.be04@voicehub.local': ['MEMBER'],
  'nv.fe02@voicehub.local': ['MEMBER'],
  'admin@voicehub.local': [],
  'danh.owner@voicehub.local': [],
};

function readEnvFile(relPath) {
  const abs = path.join(ROOT, relPath);
  if (!fs.existsSync(abs)) return {};
  const out = {};
  for (const line of fs.readFileSync(abs, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    let val = t.slice(i + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[t.slice(0, i).trim()] = val;
  }
  return out;
}

function resolveUri(...candidates) {
  for (const c of candidates) {
    if (c && String(c).trim()) return String(c).trim();
  }
  return '';
}

function loadMongodb() {
  try {
    return require('mongodb');
  } catch {
    return createRequire(path.join(ROOT, 'services/auth-service/package.json'))('mongodb');
  }
}

function loadBcrypt() {
  try {
    return require('bcrypt');
  } catch {
    return createRequire(path.join(ROOT, 'services/auth-service/package.json'))('bcrypt');
  }
}

async function resolveUserId(authDb, ObjectId, email) {
  const preferred = JWT_USER_IDS[email];
  if (preferred) return new ObjectId(preferred);
  const rows = await authDb.collection('userauths').find({ email }).toArray();
  const active = rows.find((r) => r.isActive !== false);
  return (active || rows[0])?._id || null;
}

async function main() {
  console.log(DRY ? '[dry-run] no writes' : '[apply] writing Mongo documents');
  const authEnv = { ...readEnvFile('.env'), ...readEnvFile('services/auth-service/.env') };
  const orgEnv = { ...readEnvFile('.env'), ...readEnvFile('services/organization-service/.env') };
  const projectEnv = { ...readEnvFile('.env'), ...readEnvFile('services/project-service/.env') };
  const authUri = resolveUri(authEnv.MONGODB_URI, process.env.AUTH_MONGODB_URI);
  const orgUri = resolveUri(orgEnv.MONGODB_URI, process.env.ORG_MONGODB_URI);
  const projectUri = resolveUri(projectEnv.MONGODB_URI, process.env.PROJECT_MONGODB_URI);
  if (!authUri || !orgUri || !projectUri) {
    console.error('Missing MONGODB_URI');
    process.exit(1);
  }

  const { MongoClient, ObjectId } = loadMongodb();
  const bcrypt = loadBcrypt();
  const organizationId = new ObjectId(ORG_ID);
  const authClient = new MongoClient(authUri, { maxPoolSize: 4 });
  const orgClient = new MongoClient(orgUri, { maxPoolSize: 4 });
  const projectClient = new MongoClient(projectUri, { maxPoolSize: 4 });

  try {
    await Promise.all([authClient.connect(), orgClient.connect(), projectClient.connect()]);
    const authDb = authClient.db();
    const orgDb = orgClient.db();
    const projectDb = projectClient.db();
    const roleIdByCode = Object.fromEntries(
      (
        await orgDb
          .collection('organizationalroles')
          .find({ organizationId, status: 'active' })
          .project({ code: 1 })
          .toArray()
      ).map((r) => [r.code, r._id])
    );

    const report = [];

    // Password Danh (JWT id)
    {
      const email = 'danh.owner@voicehub.local';
      const userId = await resolveUserId(authDb, ObjectId, email);
      if (!userId) report.push({ email, action: 'password', status: 'skip' });
      else {
        const hash = await bcrypt.hash(STANDARD_PASSWORD, 12);
        if (!DRY) {
          await authDb
            .collection('userauths')
            .updateOne({ _id: userId }, { $set: { password: hash, isActive: true, updatedAt: new Date() } });
        }
        report.push({ email, action: 'password', userId: String(userId), status: DRY ? 'would' : 'ok' });
      }
    }

    for (const [email, codes] of Object.entries(ORG_ROLE_TARGETS)) {
      const userId = await resolveUserId(authDb, ObjectId, email);
      if (!userId) {
        report.push({ email, action: 'orgGrants', status: 'skip' });
        continue;
      }
      const roleIds = codes.map((c) => roleIdByCode[c]).filter(Boolean);
      if (codes.length && roleIds.length !== codes.length) {
        report.push({ email, action: 'orgGrants', status: 'error', reason: 'missing role code' });
        continue;
      }
      if (!DRY) {
        await orgDb.collection('userorgrolegrants').deleteMany({ organizationId, userId });
        if (roleIds.length) {
          const now = new Date();
          await orgDb.collection('userorgrolegrants').insertMany(
            roleIds.map((roleId) => ({ organizationId, userId, roleId, createdAt: now, updatedAt: now }))
          );
        }
      }
      report.push({
        email,
        action: 'orgGrants',
        userId: String(userId),
        roles: codes,
        status: DRY ? 'would' : 'ok',
      });
    }

    // Mỹ Linh project SM
    {
      const email = 'nv.fe02@voicehub.local';
      const userId = await resolveUserId(authDb, ObjectId, email);
      const sprint = await projectDb.collection('sprints').findOne({
        $or: [{ organizationId }, { organizationId: ORG_ID }],
        status: 'planned',
      });
      const smRole =
        sprint &&
        (await projectDb.collection('projectroles').findOne({ projectId: sprint.projectId, key: 'scrum_master' }));
      if (!userId || !sprint || !smRole) {
        report.push({ email, action: 'projectSM', status: 'skip' });
      } else {
        const existing = await projectDb
          .collection('projectmemberships')
          .findOne({ projectId: sprint.projectId, userId, projectRoleId: smRole._id });
        if (!existing && !DRY) {
          await projectDb.collection('projectmemberships').updateOne(
            { projectId: sprint.projectId, userId, projectRoleId: smRole._id },
            {
              $setOnInsert: {
                organizationId,
                projectId: sprint.projectId,
                boardId: sprint.boardId || null,
                userId,
                projectRoleId: smRole._id,
                legacyBoardRole: null,
                addedBy: userId,
                createdAt: new Date(),
                updatedAt: new Date(),
              },
            },
            { upsert: true }
          );
        }
        report.push({
          email,
          action: 'projectSM',
          userId: String(userId),
          projectId: String(sprint.projectId),
          status: existing ? 'already' : DRY ? 'would' : 'ok',
        });
      }
    }

    for (const email of ['huy.sysadmin@voicehub.local', 'nv.qa02@voicehub.local']) {
      const rows = await authDb.collection('userauths').find({ email }).project({ isActive: 1 }).toArray();
      report.push({
        email,
        action: 'verify',
        status: rows.length ? 'found' : 'missing',
        isActive: rows.map((r) => r.isActive),
      });
    }

    console.log(JSON.stringify(report, null, 2));
    console.log(DRY ? '\nRe-run with --apply to write.' : '\nDone.');
  } finally {
    await Promise.allSettled([authClient.close(), orgClient.close(), projectClient.close()]);
  }
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
