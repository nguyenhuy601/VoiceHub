const UserProfile = require('../models/UserProfile');
const { logger } = require('@enterprise/shared');

/**
 * Sửa unique index phoneBlindIndex: sparse không bỏ qua giá trị null — chỉ một profile
 * không có SĐT được phép khi index cũ còn tồn tại. Dùng partial index + $unset null.
 */
async function ensureProfileIndexes() {
  const coll = UserProfile.collection;

  const unsetResult = await coll.updateMany(
    { phoneBlindIndex: null },
    { $unset: { phoneBlindIndex: '' } }
  );
  if (unsetResult.modifiedCount > 0) {
    logger.info(
      `[profileIndexes] Unset phoneBlindIndex=null on ${unsetResult.modifiedCount} profile(s)`
    );
  }

  try {
    await coll.dropIndex('phoneBlindIndex_1');
    logger.info('[profileIndexes] Dropped legacy phoneBlindIndex_1');
  } catch (error) {
    const code = Number(error?.code);
    const msg = String(error?.message || '');
    if (code !== 27 && !msg.includes('index not found') && !msg.includes('ns not found')) {
      throw error;
    }
  }

  await coll.createIndex(
    { phoneBlindIndex: 1 },
    {
      unique: true,
      name: 'phoneBlindIndex_1',
      partialFilterExpression: {
        phoneBlindIndex: { $type: 'string' },
      },
    }
  );
  logger.info('[profileIndexes] Ensured partial unique phoneBlindIndex_1');

  const unsetEmp = await coll.updateMany(
    { $or: [{ employeeCode: null }, { employeeCode: '' }] },
    { $unset: { employeeCode: '' } }
  );
  if (unsetEmp.modifiedCount > 0) {
    logger.info(`[profileIndexes] Unset empty employeeCode on ${unsetEmp.modifiedCount} profile(s)`);
  }
  try {
    await coll.dropIndex('employeeCode_1');
    logger.info('[profileIndexes] Dropped legacy employeeCode_1');
  } catch (error) {
    const code = Number(error?.code);
    const msg = String(error?.message || '');
    if (code !== 27 && !msg.includes('index not found') && !msg.includes('ns not found')) {
      throw error;
    }
  }
  await coll.createIndex(
    { employeeCode: 1 },
    {
      unique: true,
      name: 'employeeCode_1',
      partialFilterExpression: { employeeCode: { $type: 'string' } },
    }
  );
  logger.info('[profileIndexes] Ensured partial unique employeeCode_1');
}

module.exports = { ensureProfileIndexes };
