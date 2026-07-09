const {
  encryptField,
  isEncrypted,
  isEncryptionEnabled,
  decryptFieldSafe,
  phoneBlindIndex,
} = require('@enterprise/shared/utils/fieldCrypto');
const {
  readEmailFromStored,
  writeEmailFields,
  migrateEmailOnDocument,
} = require('@enterprise/shared/utils/emailPii');
const { unwrapPlaintext } = require('@enterprise/shared/utils/migration');
const {
  readDateOfBirthFromStored,
  writeDateOfBirthFields,
  migrateDateOfBirthOnDocument,
} = require('@enterprise/shared/utils/dateOfBirthPii');

function readBioPlain(stored) {
  if (stored == null || stored === '') return '';
  const text = unwrapPlaintext(stored);
  if (typeof text !== 'string') return '';
  if (text.startsWith('enc:v1:')) {
    const decoded = decryptFieldSafe(text, '');
    return decoded && !decoded.startsWith('enc:v1:') ? decoded : '';
  }
  return text;
}

/** Plaintext cho API response (GET /users/me). */
function readPiiFromProfile(plain) {
  return {
    email: readEmailFromStored(plain.email),
    bio: readBioPlain(plain.bio),
    phone: decryptFieldSafe(plain.phone, ''),
    location: unwrapPlaintext(plain.location) || '',
    dateOfBirth: readDateOfBirthFromStored(plain.dateOfBirth),
  };
}

function writeEmailPatch(email) {
  return writeEmailFields(email);
}

async function maybeMigrateProfileEmail(UserProfile, doc) {
  if (!doc) return null;
  const { plain, persist } = migrateEmailOnDocument(doc);
  if (persist && doc._id) {
    await UserProfile.updateOne({ _id: doc._id }, { $set: persist });
    Object.assign(doc, persist);
  }
  return plain;
}

async function maybeMigrateProfilePii(UserProfile, doc) {
  if (!doc) return;
  let persist = null;
  const emailM = migrateEmailOnDocument(doc);
  if (emailM.persist) persist = { ...emailM.persist };
  const dobM = migrateDateOfBirthOnDocument(doc);
  if (dobM.persist) persist = { ...(persist || {}), ...dobM.persist };
  if (persist && doc._id) {
    await UserProfile.updateOne({ _id: doc._id }, { $set: persist });
    Object.assign(doc, persist);
  }
}

/**
 * Chuẩn bị PATCH profile — mã hóa at-rest khi bật ENCRYPTION_MASTER_KEY.
 * @returns {{ patch: object, unset: string[] }}
 */
function writePiiPatch(input = {}) {
  const patch = {};
  const unset = [];
  if (input.bio !== undefined) {
    const plain = String(input.bio ?? '').trim();
    patch.bio = plain && isEncryptionEnabled() ? encryptField(plain) : plain;
  }
  if (input.location !== undefined) {
    const plain = String(input.location ?? '').trim();
    patch.location = plain && isEncryptionEnabled() ? encryptField(plain) : plain;
  }
  if (input.phone !== undefined) {
    const plain = String(input.phone ?? '').trim();
    if (!plain) {
      patch.phone = '';
      unset.push('phoneBlindIndex');
    } else if (isEncryptionEnabled()) {
      patch.phone = encryptField(plain);
      patch.phoneBlindIndex = phoneBlindIndex(plain);
    } else {
      patch.phone = plain;
      unset.push('phoneBlindIndex');
    }
  }
  if (input.dateOfBirth !== undefined) {
    Object.assign(patch, writeDateOfBirthFields(input.dateOfBirth));
  }
  if (Object.keys(patch).length > 0 && isEncryptionEnabled()) {
    patch.encV = 1;
  }
  return { patch, unset };
}

module.exports = {
  readPiiFromProfile,
  writePiiPatch,
  writeEmailPatch,
  writeDateOfBirthFields,
  maybeMigrateProfileEmail,
  maybeMigrateProfilePii,
};
