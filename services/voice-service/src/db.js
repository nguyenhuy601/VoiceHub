/**
 * Mongoose singleton — PHẢI trùng instance với connectDB() trong shared/config/mongo.js.
 * Không dùng require('mongoose') trực tiếp trong model (sẽ là bản copy khác → buffering / không có DB).
 */
const { mongoose } = require('../../../shared/config/mongo');

module.exports = mongoose;
