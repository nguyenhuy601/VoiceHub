/**
 * Durable cache for WBS LLM chunk responses (Mongo).
 */

const mongoose = require('../db');

const wbsLlmChunkCacheSchema = new mongoose.Schema(
  {
    cacheKey: { type: String, required: true, maxlength: 64, unique: true },
    data: { type: mongoose.Schema.Types.Mixed, required: true },
    model: { type: String, default: null, maxlength: 128 },
    usage: { type: mongoose.Schema.Types.Mixed, default: null },
    promptChars: { type: Number, default: null },
    expiresAt: { type: Date, required: true, index: true },
  },
  { timestamps: true, collection: 'wbs_llm_chunk_cache' }
);

wbsLlmChunkCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports =
  mongoose.models.WbsLlmChunkCache ||
  mongoose.model('WbsLlmChunkCache', wbsLlmChunkCacheSchema);
