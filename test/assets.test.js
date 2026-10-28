'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const syncFs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { pathToFileURL, fileURLToPath } = require('node:url');
const { prepareAssets, writeAssets, verifyInjection, stickerScript, stickerDeclarations } = require('../src/assets');

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl9sAAAAASUVORK5CYII=', 'base64');

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'appearance-assets-test-'));
  t.after(async () => {
    const resolved = await fs.realpath(root), parent = await fs.realpath(os.tmpdir());
    assert.equal(path.dirname(resolved), parent);
    assert.ok(path.basename(resolved).startsWith('appearance-assets-test-'));
    await fs.rm(resolved, { recursive: true });
  });
  const smoothPath = path.join(root, 'gental.smoothui-2.0.0');
  await fs.mkdir(smoothPath);
  await fs.writeFile(path.join(smoothPath, 'css.css'), '.quick-input-widget { border-radius: 10px; }');
  await fs.writeFile(path.join(smoothPath, 'js.js'), 'const smoothFixture = true;');
  const stickerPath = path.join(root, 'custom sticker.png');
  await fs.writeFile(stickerPath, png);
  return { root, smoothPath, stickerPath, storage: path.join(root, 'storage'), imports: [] };
}

test('Smooth UI repairs obsolete paths, preserves unrelated imports and matches its native URI format', async t => {
  const data = await fixture(t);
  const extra = path.join(data.root, 'my.css');
  await fs.writeFile(extra, '.keep { color: red; }');
  data.imports = [pathToFileURL(extra).href,
    pathToFileURL(path.join(data.root, 'gental.smoothui-1.0.0', 'css.css')).href,
    pathToFileURL(path.join(data.root, 'gental.smoothui-1.0.0', 'js.js')).href];
  const recipe = await prepareAssets(data);
  assert.equal(recipe.imports[0], pathToFileURL(extra).href);
  assert.ok(recipe.imports.includes(`file:///${data.smoothPath}/css.css`));
  assert.ok(recipe.imports.includes(`file:///${data.smoothPath}/js.js`));
  assert.equal(recipe.imports.some(uri => uri.includes('smoothui-1.0.0')), false);
  assert.equal(recipe.expected.length, 2);
  assert.equal(recipe.customSticker, true);
  assert.equal(recipe.assets.length, 1);
});

test('managed sticker is offline, content-addressed and deduplicated on repeated restoration', async t => {
  const data = await fixture(t);
  const first = await prepareAssets(data);
  await writeAssets(first);
  const next = await prepareAssets({ ...data, imports: first.imports });
  assert.deepEqual(first.imports, next.imports);
  assert.equal(next.assets[0].file, first.assets[0].file);
  const content = await fs.readFile(fileURLToPath(first.assets[0].uri), 'utf8');
  assert.ok(content.includes(png.toString('base64')));
  assert.equal(content.includes('fetch('), false);
  assert.equal(content.includes(data.stickerPath), false);
  await fs.writeFile(data.stickerPath, Buffer.concat([png, Buffer.from('changed')]));
  const changed = await prepareAssets({ ...data, imports: first.imports });
  assert.notEqual(changed.assets[0].file, first.assets[0].file);
  assert.ok(!changed.imports.includes(first.assets[0].uri));
});

test('publisher migration regenerates a missing legacy sticker and preserves unrelated imports', async t => {
  const data = await fixture(t);
  data.storage = path.join(data.root, 'globalStorage', 'zxckurayami.appearance-restore');
  const legacyStorage = path.join(path.dirname(data.storage), 'zxckurayami-local.appearance-restore');
  const legacyFile = path.join(legacyStorage, 'assets', 'doki-sticker-4f69e7a3b9f1d41a.js');
  const extra = path.join(data.root, 'my.css');
  await fs.writeFile(extra, '.keep { color: red; }');
  const imports = [pathToFileURL(legacyFile).href, pathToFileURL(extra).href,
    `file:///${data.smoothPath}/css.css`, `file:///${data.smoothPath}/js.js`];
  const recipe = await prepareAssets({ ...data, imports, manageSticker: true });
  assert.equal(recipe.imports.includes(imports[0]), false);
  assert.equal(recipe.imports[0], pathToFileURL(extra).href);
  assert.equal(recipe.assets.length, 1);
  assert.equal(path.dirname(recipe.assets[0].file), path.join(data.storage, 'assets'));
  assert.ok(recipe.assets[0].content.toString('utf8').includes(png.toString('base64')));
  assert.deepEqual(await fs.readFile(data.stickerPath), png);
  await assert.rejects(fs.access(data.storage), { code: 'ENOENT' });
  await assert.rejects(fs.access(legacyStorage), { code: 'ENOENT' });
  await writeAssets(recipe);
  const repeated = await prepareAssets({ ...data, imports: recipe.imports });
  assert.deepEqual(repeated.imports, recipe.imports);
  assert.equal(await fs.readFile(extra, 'utf8'), '.keep { color: red; }');
});

test('publisher migration removes only selected legacy generated components before checking old files', async t => {
  const data = await fixture(t);
  data.storage = path.join(data.root, 'globalStorage', 'zxckurayami.appearance-restore');
  const directory = path.join(path.dirname(data.storage), 'zxckurayami-local.appearance-restore', 'assets');
  const imports = ['smooth-ui-0123456789abcdef.css', 'smooth-ui-fedcba9876543210.js', 'doki-sticker-4f69e7a3b9f1d41a.js']
    .map(name => pathToFileURL(path.join(directory, name)).href);
  const recipe = await prepareAssets({ ...data, imports });
  assert.equal(recipe.imports.some(entry => imports.includes(entry)), false);
  const cleared = await prepareAssets({ ...data, imports, stickerPath: '', manageSticker: true });
  assert.equal(cleared.customSticker, false);
  assert.equal(cleared.assets.length, 0);
  assert.deepEqual(cleared.imports, [`file:///${data.smoothPath}/css.css`, `file:///${data.smoothPath}/js.js`]);
});

test('a missing unselected managed component reports how to regenerate it without changing imports', async t => {
  const data = await fixture(t);
  data.storage = path.join(data.root, 'globalStorage', 'zxckurayami.appearance-restore');
  for (const publisher of ['zxckurayami.appearance-restore', 'zxckurayami-local.appearance-restore']) {
    const file = path.join(path.dirname(data.storage), publisher, 'assets', 'doki-sticker-4f69e7a3b9f1d41a.js');
    const imports = [pathToFileURL(file).href];
    await assert.rejects(prepareAssets({ ...data, imports, stickerPath: '', manageSticker: false }),
      error => error.message === 'MANAGED_ASSET_MISSING' && error.cause.code === 'ENOENT');
    assert.deepEqual(imports, [pathToFileURL(file).href]);
  }
  await assert.rejects(fs.access(data.storage), { code: 'ENOENT' });
});

test('publisher migration never discards lookalike paths outside its exact legacy storage', async t => {
  const data = await fixture(t);
  data.storage = path.join(data.root, 'globalStorage', 'zxckurayami.appearance-restore');
  const legacy = path.join(path.dirname(data.storage), 'zxckurayami-local.appearance-restore', 'assets');
  const files = [
    path.join(data.root, 'elsewhere', 'zxckurayami-local.appearance-restore', 'assets', 'doki-sticker-4f69e7a3b9f1d41a.js'),
    path.join(path.dirname(data.storage), 'other.appearance-restore', 'assets', 'doki-sticker-4f69e7a3b9f1d41a.js'),
    path.join(legacy, 'custom.js'),
    path.join(legacy, 'doki-sticker-4f69e7a3b9f1d41a.js.backup.js'),
    path.join(legacy, 'nested', 'doki-sticker-4f69e7a3b9f1d41a.js'),
  ];
  for (const file of files) {
    await assert.rejects(prepareAssets({ ...data, imports: [pathToFileURL(file).href] }), { code: 'ENOENT' });
  }
  await fs.mkdir(path.dirname(files[0]), { recursive: true });
  await fs.writeFile(files[0], 'const userOwnedScript = true;');
  const uri = pathToFileURL(files[0]).href;
  const recipe = await prepareAssets({ ...data, imports: [uri] });
  assert.equal(recipe.imports[0], uri);
  assert.equal(await fs.readFile(files[0], 'utf8'), 'const userOwnedScript = true;');
});

test('restoring only a sticker preserves Smooth UI native import spelling', async t => {
  const data = await fixture(t);
  const original = [`file:///${data.smoothPath}/css.css`, `file:///${data.smoothPath}/js.js`];
  const recipe = await prepareAssets({ ...data, smoothPath: undefined, imports: original });
  assert.deepEqual(recipe.imports.slice(0, 2), original);
});

test('sticker mounts after the workbench exists, stays click-through and never duplicates', () => {
  const nodes = new Map();
  let root, observer;
  const append = element => nodes.set(element.id, element);
  const document = {
    head: { appendChild: append }, documentElement: {},
    querySelector: () => root,
    getElementById: id => nodes.get(id),
    createElement: () => ({ style: {}, setAttribute(name, value) { this[name] = value; } }),
  };
  const context = vm.createContext({ document, MutationObserver: class {
    constructor(callback) { observer = callback; }
    observe() {} disconnect() {}
  } });
  const code = stickerScript(png, 'z-index:100;background-position:100% 97%;background-size:240px auto');
  vm.runInContext(code, context);
  assert.equal(nodes.size, 0);
  root = { appendChild: append };
  observer();
  assert.equal(nodes.size, 2);
  const sticker = nodes.get('appearance-restore-doki-sticker');
  assert.ok(sticker.style.cssText.includes('pointer-events:none!important'));
  assert.ok(sticker.style.cssText.includes('background-size:240px auto'));
  assert.equal(sticker['aria-hidden'], 'true');
  vm.runInContext(code, context);
  assert.equal(nodes.size, 2);
});

test('clearing the configured custom sticker removes its managed import on restoration', async t => {
  const data = await fixture(t);
  const first = await prepareAssets(data);
  await writeAssets(first);
  const cleared = await prepareAssets({ ...data, imports: first.imports, stickerPath: '', manageSticker: true });
  assert.equal(cleared.customSticker, false);
  assert.equal(cleared.assets.length, 0);
  assert.equal(cleared.imports.includes(first.assets[0].uri), false);
});

test('unsafe sticker CSS, non-images, missing files and remote imports fail before writes', async t => {
  const data = await fixture(t);
  assert.throws(() => stickerDeclarations('background-image:url(https://example.com/a)'), /STICKER_CSS/);
  assert.throws(() => stickerDeclarations('pointer-events:auto'), /STICKER_CSS/);
  assert.throws(() => stickerDeclarations('filter:u\\rl(test)'), /STICKER_CSS/);
  assert.throws(() => stickerScript(Buffer.from('<svg/>'), ''), /STICKER_FORMAT/);
  await assert.rejects(prepareAssets({ ...data, imports: ['https://example.com/file.js'] }), /LOCAL_IMPORT_REQUIRED/);
  await assert.rejects(prepareAssets({ ...data, stickerPath: path.join(data.root, 'missing.png') }), { code: 'ENOENT' });
  await assert.rejects(fs.access(data.storage), { code: 'ENOENT' });
});

test('verification catches silent loader failures and checks both Smooth UI files', async t => {
  const data = await fixture(t);
  const recipe = await prepareAssets(data);
  const directory = path.join(data.root, 'out/vs/code/electron-browser/workbench');
  await fs.mkdir(directory, { recursive: true });
  const file = path.join(directory, 'workbench.html');
  await fs.writeFile(file, '<html>not patched</html>');
  await assert.rejects(verifyInjection(data.root, recipe), /INJECTION_NOT_APPLIED/);
  await fs.writeFile(file, `VSCODE-CUSTOM-CSS-START ${recipe.assets[0].marker} ${recipe.expected[0]}`);
  await assert.rejects(verifyInjection(data.root, recipe), /INJECTION_NOT_APPLIED/);
  await fs.writeFile(file, `VSCODE-CUSTOM-CSS-START ${recipe.assets[0].marker} ${recipe.expected.join('\n')}`);
  await assert.rejects(verifyInjection(data.root, recipe), /INJECTION_NOT_APPLIED/);
  await fs.writeFile(file, `VSCODE-CUSTOM-CSS-START ${recipe.assets[0].content.toString('utf8')} ${recipe.expected.join('\n')}`);
  await verifyInjection(data.root, recipe);
});

const loader = path.join(os.homedir(), '.vscode/extensions/be5invis.vscode-custom-css-7.5.1/src/extension.js');
test('installed Custom CSS Loader embeds actual Smooth UI and a migrated sticker in an isolated editor fixture',
  { skip: !syncFs.existsSync(loader) }, async t => {
    const data = await fixture(t);
    data.storage = path.join(data.root, 'globalStorage', 'zxckurayami.appearance-restore');
    data.imports = [pathToFileURL(path.join(path.dirname(data.storage), 'zxckurayami-local.appearance-restore',
      'assets', 'doki-sticker-4f69e7a3b9f1d41a.js')).href];
    const actualSmooth = path.join(os.homedir(), '.vscode/extensions/gental.smoothui-1.1.5');
    if (syncFs.existsSync(actualSmooth)) data.smoothPath = actualSmooth;
    const recipe = await prepareAssets(data);
    await writeAssets(recipe);
    const directory = path.join(data.root, 'out/vs/code/electron-browser/workbench');
    await fs.mkdir(directory, { recursive: true });
    const htmlPath = path.join(directory, 'workbench.html');
    await fs.writeFile(htmlPath, '<html><head><meta http-equiv="Content-Security-Policy" content="default-src self" /></head><body></body></html>');
    const commands = new Map();
    const api = {
      workspace: { getConfiguration: () => ({ imports: recipe.imports, statusbar: false }) },
      window: { showInformationMessage: async () => undefined, showWarningMessage: async () => undefined },
      commands: { registerCommand: (name, action) => { commands.set(name, action); return { dispose() {} }; } },
    };
    const relativeRequire = createRequire(loader);
    const customRequire = name => name === 'vscode' ? api : relativeRequire(name);
    customRequire.main = { filename: path.join(data.root, 'out/cli.js') };
    const module = { exports: {} };
    const wrapper = vm.runInNewContext(`(function(require, module, exports) { ${await fs.readFile(loader, 'utf8')}\n})`, {
      Array, Buffer, process, console: { log() {}, error() {} }, __dirname: path.dirname(loader),
    });
    wrapper(customRequire, module, module.exports);
    module.exports.activate({ subscriptions: [] });
    await commands.get('extension.installCustomCSS')();
    await verifyInjection(data.root, recipe);
    await commands.get('extension.installCustomCSS')();
    await verifyInjection(data.root, recipe);
    const html = await fs.readFile(htmlPath, 'utf8');
    assert.equal(html.split(recipe.assets[0].marker).length - 1, 1);
    assert.equal(html.split(recipe.expected[1]).length - 1, 1);
    assert.equal(html.includes(png.toString('base64')), true);
  });
