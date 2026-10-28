'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');

const CORE_FILES = [
  'package.json', 'product.json', 'out/main.js',
  'out/vs/code/electron-main/main.js', 'out/vs/code/electron-main/mainImpl.js',
  'out/vs/workbench/workbench.desktop.main.js', 'out/vs/workbench/workbench.desktop.main.css',
  ...['electron-browser', 'electron-sandbox'].flatMap(directory =>
    ['', '/workbench'].flatMap(suffix =>
      ['workbench.html', 'workbench.esm.html', 'workbench-dev.html', 'workbench-apc-extension.html']
        .map(name => `out/vs/code/${directory}${suffix}/${name}`))),
];

async function withLock(storage, action) {
  await fs.mkdir(storage, { recursive: true, mode: 0o700 });
  const file = path.join(storage, 'restore.lock');
  let handle;
  try {
    handle = await fs.open(file, 'wx', 0o600);
  } catch (error) {
    if (error.code === 'EEXIST') {
      const busy = new Error('RESTORE_LOCKED');
      busy.code = 'RESTORE_LOCKED';
      throw busy;
    }
    throw error;
  }
  try {
    await handle.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
    return await action();
  } finally {
    await handle.close();
    await fs.unlink(file);
  }
}

async function snapshot(appRoot, storage, metadata) {
  const root = await fs.realpath(appRoot);
  const directory = path.join(storage, 'backups', `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`);
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const files = [];
  for (const relative of CORE_FILES) {
    const source = path.join(root, relative);
    let stat;
    try {
      stat = await fs.lstat(source);
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Unsupported editor file: ${relative}`);
    const target = path.join(directory, 'files', relative);
    await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    await fs.copyFile(source, target);
    const bytes = await fs.readFile(target);
    files.push({ relative, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
  }
  if (!files.some(file => file.relative === 'package.json') ||
      !files.some(file => file.relative === 'out/vs/workbench/workbench.desktop.main.css')) {
    throw new Error('Unsupported editor installation: critical files not found');
  }
  const manifest = { ...metadata, appRoot: root, createdAt: new Date().toISOString(), files };
  await fs.writeFile(path.join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2), { mode: 0o600 });
  return directory;
}

module.exports = { CORE_FILES, withLock, snapshot };
