#!/usr/bin/env node
/**
 * Generate VoiceHub release manifest (17 Swarm app services).
 *
 * Usage:
 *   node devops/scripts/release/generate-release-manifest.mjs \
 *     --commit <sha> --release-id <id> --owner <owner> \
 *     [--registry ghcr.io] \
 *     [--built path/to/built.json] \
 *     [--previous path/to/previous-manifest.json] \
 *     [--fixture path/to/partial.json] \
 *     [--out path/to/manifest.json]
 *
 * built.json: { "api-gateway": "sha256:abc...", ... }  (digest only or full repo@digest)
 * fixture: partial services overlay for local tests (no registry)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../..');

function parseArgs(argv) {
  const out = {
    commit: '',
    releaseId: '',
    owner: '',
    registry: 'ghcr.io',
    built: '',
    previous: '',
    fixture: '',
    out: '',
  };
  for (let i = 2; i < argv.length; i += 1) {
    const k = argv[i];
    const v = argv[i + 1];
    switch (k) {
      case '--commit':
        out.commit = v;
        i += 1;
        break;
      case '--release-id':
        out.releaseId = v;
        i += 1;
        break;
      case '--owner':
        out.owner = v;
        i += 1;
        break;
      case '--registry':
        out.registry = v;
        i += 1;
        break;
      case '--built':
        out.built = v;
        i += 1;
        break;
      case '--previous':
        out.previous = v;
        i += 1;
        break;
      case '--fixture':
        out.fixture = v;
        i += 1;
        break;
      case '--out':
        out.out = v;
        i += 1;
        break;
      default:
        throw new Error(`Unknown arg: ${k}`);
    }
  }
  return out;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function normalizeDigest(repo, digestOrRef) {
  const d = String(digestOrRef || '').trim();
  if (!d) return '';
  if (d.includes('@sha256:')) return d;
  if (d.startsWith('sha256:')) return `${repo}@${d}`;
  return d;
}

function loadCatalog() {
  return readJson(path.join(ROOT, '.github/swarm-app-images.json'));
}

function main() {
  const args = parseArgs(process.argv);
  if (!args.commit || !args.releaseId || !args.owner) {
    throw new Error('--commit, --release-id, and --owner are required');
  }

  const catalog = loadCatalog();
  const built = args.built ? readJson(args.built) : {};
  const previous = args.previous ? readJson(args.previous) : null;
  const fixture = args.fixture ? readJson(args.fixture) : null;

  const services = {};
  const missing = [];

  for (const row of catalog) {
    const name = row.image;
    const repository = `${args.registry}/${args.owner}/voicehub/${name}`;
    const tag = args.commit;

    let digest = '';
    if (built[name]) {
      digest = normalizeDigest(repository, built[name]);
    } else if (fixture?.services?.[name]?.digest) {
      digest = normalizeDigest(repository, fixture.services[name].digest);
    } else if (previous?.services?.[name]?.digest) {
      digest = String(previous.services[name].digest);
    }

    if (!digest) {
      missing.push(name);
      continue;
    }

    services[name] = { repository, tag, digest };
  }

  if (missing.length) {
    console.error(
      `Missing digests for ${missing.length} service(s): ${missing.join(', ')}\n` +
        'Provide --built digests and/or --previous release manifest (RULE-05).'
    );
    process.exit(1);
  }

  if (Object.keys(services).length !== catalog.length) {
    throw new Error(
      `Expected ${catalog.length} services, got ${Object.keys(services).length}`
    );
  }

  const manifest = {
    releaseId: args.releaseId,
    commit: args.commit,
    createdAt: new Date().toISOString(),
    registry: args.registry,
    owner: args.owner,
    services,
  };

  const json = `${JSON.stringify(manifest, null, 2)}\n`;
  if (args.out) {
    fs.mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true });
    fs.writeFileSync(args.out, json, 'utf8');
    console.error(`Wrote ${args.out}`);
  } else {
    process.stdout.write(json);
  }
}

main();
