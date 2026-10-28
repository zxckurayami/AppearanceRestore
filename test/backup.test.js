'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { withLock, snapshot } = require('../src/backup');

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'appearance-restore-test-'));
  t.after(async () => {
    const resolved = await fs.realpath(root);
    const parent = await fs.realpath(os.tmpdir());
    assert.equal(path.dirname(resolved), parent);
    assert.ok(path.basename(resolved).startsWith('appearance-restore-test-'));
    await fs.rm(resolved, { recursive: true });
  });
  const app = path.join(root, 'editor');
  const storage = path.join(root, 'storage');
  await fs.mkdir(path.join(app, 'out/vs/workbench'), { recursive: true });
  await fs.writeFile(path.join(app, 'package.json'), '{"version":"1.143.1"}');
  await fs.writeFile(path.join(app, 'out/vs/workbench/workbench.desktop.main.css'), '.test { color: red; }');
  return { app, storage };
}

test('snapshots preserve exact bytes and hashes without modifying editor files', async t => {
  const { app, storage } = await fixture(t);
  const directory = await snapshot(app, storage, { version: '1.143.1', extensions: {} });
  const manifest = JSON.parse(await fs.readFile(path.join(directory, 'manifest.json')));
  assert.equal(manifest.version, '1.143.1');
  assert.equal(manifest.files.length, 2);
  for (const file of manifest.files) {
    const before = await fs.readFile(path.join(app, file.relative));
    const copy = await fs.readFile(path.join(directory, 'files', file.relative));
    assert.deepEqual(copy, before);
    assert.equal(file.bytes, copy.length);
    assert.equal(file.sha256, createHash('sha256').update(copy).digest('hex'));
  }
  const next = await snapshot(app, storage, { version: '1.144.0' });
  assert.notEqual(next, directory);
  assert.equal(JSON.parse(await fs.readFile(path.join(directory, 'manifest.json'))).version, '1.143.1');
});

test('unsupported editor layout fails before restoration can run', async t => {
  const { app, storage } = await fixture(t);
  await fs.unlink(path.join(app, 'out/vs/workbench/workbench.desktop.main.css'));
  await assert.rejects(snapshot(app, storage, {}), /critical files/);
});

test('a second window cannot run restoration or delete the first lock', async t => {
  const { storage } = await fixture(t);
  await withLock(storage, async () => {
    const file = path.join(storage, 'restore.lock');
    const before = await fs.readFile(file);
    await assert.rejects(withLock(storage, async () => assert.fail()), { code: 'RESTORE_LOCKED' });
    assert.deepEqual(await fs.readFile(file), before);
  });
  await assert.rejects(fs.access(path.join(storage, 'restore.lock')), { code: 'ENOENT' });
});

test('a failed run releases its lock for a later retry', async t => {
  const { storage } = await fixture(t);
  await assert.rejects(withLock(storage, async () => { throw new Error('failed'); }), /failed/);
  assert.equal(await withLock(storage, async () => 'retry'), 'retry');
});
