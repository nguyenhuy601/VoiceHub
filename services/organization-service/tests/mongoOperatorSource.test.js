const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const BANNED = /\.find\(\s*req\.body|\.findOne\(\s*req\.body/;

function walkJs(dir, acc = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) {
      walkJs(full, acc);
    } else if (name.endsWith('.js')) {
      acc.push(full);
    }
  }
  return acc;
}

describe('organization-service mongo operator source', () => {
  it('has no find(req.body) or findOne(req.body)', () => {
    const root = path.join(__dirname, '../src');
    const hits = [];
    for (const file of walkJs(root)) {
      const text = fs.readFileSync(file, 'utf8');
      if (BANNED.test(text)) hits.push(path.relative(root, file));
    }
    assert.deepEqual(hits, []);
  });
});
