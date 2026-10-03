/**
 * Shared mongoose singleton — avoid multiple mongoose copies / buffering timeouts.
 */
const { mongoose } = require('@enterprise/shared/config/mongo');

module.exports = mongoose;
