#!/usr/bin/env node
/**
 * One-shot: copy `documents` collection from document_db → organization_db.
 *
 * Reads URIs from (first match wins per DB):
 *   DOCUMENT_MONGODB_URI / ORG_MONGODB_URI env
 *   services/document-service/.env → MONGODB_URI
 *   services/organization-service/.env → MONGODB_URI
 *
 * Usage (from repo root):
 *   node devops/scripts/migrate-documents-to-organization-db.js
 *   node devops/scripts/migrate-documents-to-organization-db.js --dry-run
 *
 * Does not print full Mongo URIs. Idempotent upsert by _id.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const Module = require('module');

const ROOT = path.resolve(__dirname, '../..');
const DRY = process.argv.includes('--dry-run');
const BATCH = Math.min(500, Math.max(50, Number(process.env.DOCUMENT_MIGRATE_BATCH || 200)));

/** Resolve mongodb from organization-service (no root install). */
function loadMongoClient() {
  const paths = [
    path.join(ROOT, 'services/organization-service/node_modules'),
    path.join(ROOT, 'services/document-service/node_modules'),
    path.join(ROOT, 'node_modules'),
  ];
  const req = Module.createRequire(path.join(ROOT, 'services/organization-service/package.json'));
  try {
    return req('mongodb').MongoClient;
  } catch {
    for (const p of paths) {
      try {
        // eslint-disable-next-line import/no-dynamic-require, global-require
        return require(path.join(p, 'mongodb')).MongoClient;
      } catch {
        /* try next */
      }
    }
    throw new Error('Cannot resolve package "mongodb". Run npm install in services/organization-service.');
  }
}

function readEnvFile(relPath) {
  const abs = path.join(ROOT, relPath);
  if (!fs.existsSync(abs)) return {};
  const out = {};
  for (const line of fs.readFileSync(abs, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function redactUri(uri) {
  return String(uri || '').replace(/\/\/([^/@]+)@/, '//***@');
}

function resolveUris() {
  const docEnv = readEnvFile('services/document-service/.env');
  const orgEnv = readEnvFile('services/organization-service/.env');
  const source =
    String(process.env.DOCUMENT_MONGODB_URI || '').trim() ||
    String(docEnv.MONGODB_URI || '').trim();
  const target =
    String(process.env.ORG_MONGODB_URI || process.env.ORGANIZATION_MONGODB_URI || '').trim() ||
    String(orgEnv.MONGODB_URI || '').trim();
  return { source, target };
}

async function main() {
  const { source, target } = resolveUris();
  if (!source || !target) {
    console.error(
      'Missing Mongo URI. Set DOCUMENT_MONGODB_URI + ORG_MONGODB_URI, or services/*/ .env MONGODB_URI.'
    );
    process.exit(1);
  }
  if (source === target) {
    console.error('Source and target Mongo URI are identical — abort.');
    process.exit(1);
  }

  console.log(`Source: ${redactUri(source)}`);
  console.log(`Target: ${redactUri(target)}`);
  console.log(DRY ? 'Mode: dry-run' : 'Mode: upsert');

  const MongoClient = loadMongoClient();
  const srcClient = new MongoClient(source);
  const dstClient = new MongoClient(target);
  await srcClient.connect();
  await dstClient.connect();

  try {
    const srcCol = srcClient.db().collection('documents');
    const dstCol = dstClient.db().collection('documents');
    const total = await srcCol.countDocuments();
    console.log(`Source documents count: ${total}`);

    let scanned = 0;
    let upserted = 0;
    const cursor = srcCol.find({}).batchSize(BATCH);
    let batch = [];

    async function flush() {
      if (!batch.length) return;
      if (DRY) {
        scanned += batch.length;
        batch = [];
        return;
      }
      const ops = batch.map((doc) => ({
        replaceOne: {
          filter: { _id: doc._id },
          replacement: doc,
          upsert: true,
        },
      }));
      const res = await dstCol.bulkWrite(ops, { ordered: false });
      upserted += (res.upsertedCount || 0) + (res.modifiedCount || 0) + (res.matchedCount || 0);
      scanned += batch.length;
      batch = [];
    }

    for await (const doc of cursor) {
      batch.push(doc);
      if (batch.length >= BATCH) await flush();
    }
    await flush();

    const destCount = await dstCol.countDocuments();
    console.log(`Scanned: ${scanned}`);
    if (!DRY) console.log(`Upsert ops accounted: ${upserted}`);
    console.log(`Target documents count: ${destCount}`);
    console.log(DRY ? 'Dry-run complete (no writes).' : 'Migrate complete.');
  } finally {
    await srcClient.close().catch(() => {});
    await dstClient.close().catch(() => {});
  }
}

main().catch((err) => {
  console.error('Migrate failed:', err?.message || err);
  process.exit(1);
});
