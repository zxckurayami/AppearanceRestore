'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { fileURLToPath, pathToFileURL } = require('node:url');
const { createHash } = require('node:crypto');

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const key = file => process.platform === 'win32' ? path.resolve(file).toLowerCase() : path.resolve(file);
const json = value => JSON.stringify(value).replace(/</g, '\\u003c');

function localImport(entry) {
  if (typeof entry !== 'string' || entry.includes('${')) throw new Error('LOCAL_IMPORT_REQUIRED');
  const url = new URL(entry);
  if (url.protocol !== 'file:' || !/\.(css|js)$/.test(url.pathname)) throw new Error('LOCAL_IMPORT_REQUIRED');
  return fileURLToPath(url);
}

function isSmoothSource(file) {
  return /^gental\.smoothui-/i.test(path.basename(path.dirname(file))) &&
    ['css.css', 'js.js'].includes(path.basename(file));
}

function managedKind(file, directory) {
  const storage = path.dirname(directory);
  // Only the former local publisher in this profile is a migration source.
  const legacyDirectory = path.basename(storage).toLowerCase() === 'zxckurayami.appearance-restore' ?
    path.join(path.dirname(storage), 'zxckurayami-local.appearance-restore', 'assets') : undefined;
  if (key(path.dirname(file)) !== key(directory) &&
      (!legacyDirectory || key(path.dirname(file)) !== key(legacyDirectory))) return undefined;
  if (/^smooth-ui-[a-f0-9]{16}\.(css|js)$/.test(path.basename(file))) return 'smooth';
  if (/^doki-sticker-[a-f0-9]{16}\.js$/.test(path.basename(file))) return 'sticker';
  return undefined;
}

function imageMime(bytes) {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (/^GIF8[79]a$/.test(bytes.subarray(0, 6).toString('ascii'))) return 'image/gif';
  if (bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  throw new Error('STICKER_FORMAT');
}

function stickerDeclarations(css) {
  const allowed = new Set(['z-index', 'background-position', 'background-size', 'background-repeat',
    'opacity', 'width', 'height', 'max-width', 'max-height', 'top', 'right', 'bottom', 'left',
    'inset', 'filter', 'transform', 'transform-origin']);
  return String(css || 'z-index:100;background-position:100% 97%').split(';').filter(value => value.trim()).map(declaration => {
    const colon = declaration.indexOf(':');
    const property = declaration.slice(0, colon).trim().toLowerCase();
    const value = declaration.slice(colon + 1).trim();
    if (colon < 1 || !allowed.has(property) || !value || !/^[\w\s.,()%#:+\-!/'"]+$/.test(value) ||
        /url\s*\(|expression\s*\(|\/\*/i.test(value)) throw new Error('STICKER_CSS');
    return `${property}:${value};`;
  }).join('');
}

function stickerScript(bytes, css) {
  const uri = `data:${imageMime(bytes)};base64,${bytes.toString('base64')}`;
  const style = `position:absolute;inset:0;pointer-events:none!important;background-repeat:no-repeat;opacity:1;z-index:100;${stickerDeclarations(css)}`;
  return `/* AppearanceRestore:DokiSticker:${hash(Buffer.concat([bytes, Buffer.from(style)]))} */
(() => {
  const mount = () => {
    const root = document.querySelector('.monaco-workbench');
    if (!root) return false;
    let sticker = document.getElementById('appearance-restore-doki-sticker');
    if (!sticker) {
      sticker = document.createElement('div');
      sticker.id = 'appearance-restore-doki-sticker';
      sticker.setAttribute('aria-hidden', 'true');
      root.appendChild(sticker);
    }
    sticker.style.cssText = ${json(style)};
    sticker.style.backgroundImage = ${json(`url("${uri}")`)};
    let styles = document.getElementById('appearance-restore-doki-style');
    if (!styles) {
      styles = document.createElement('style');
      styles.id = 'appearance-restore-doki-style';
      styles.textContent = 'body > .monaco-workbench > .monaco-grid-view > .monaco-grid-branch-node > .monaco-split-view2 > .split-view-container::after, body > .monaco-workbench > .monaco-grid-view > .monaco-grid-branch-node > .monaco-split-view2 > .monaco-scrollable-element > .split-view-container::after { content:none!important; }';
      document.head.appendChild(styles);
    }
    return true;
  };
  if (!mount()) {
    const observer = new MutationObserver(() => { if (mount()) observer.disconnect(); });
    observer.observe(document.documentElement, { childList:true, subtree:true });
  }
})();`;
}

async function prepareAssets({ imports, storage, smoothPath, stickerPath, stickerCss, manageSticker = Boolean(stickerPath) }) {
  if (!Array.isArray(imports)) throw new Error('LOCAL_IMPORT_REQUIRED');
  const directory = path.join(storage, 'assets');
  const assets = [];
  const smoothImports = [], expected = [];
  function add(kind, extension, source) {
    if (/<\/(?:script|style)/i.test(source)) throw new Error('UNSAFE_INLINE_ASSET');
    const content = Buffer.from(source);
    const file = path.join(directory, `${kind}-${hash(content).slice(0, 16)}.${extension}`);
    assets.push({ file, content, marker: source.slice(0, source.indexOf('\n')), uri: pathToFileURL(file).href });
  }
  if (smoothPath) {
    for (const sourceName of ['css.css', 'js.js']) {
      const source = await fs.readFile(path.join(smoothPath, sourceName), 'utf8');
      if (/<\/(?:script|style)/i.test(source)) throw new Error('UNSAFE_INLINE_ASSET');
      // Match Smooth UI's own URI spelling, so activation does not add a second
      // copy and run its JavaScript twice. The active extension supplies the path.
      smoothImports.push(`file:///${smoothPath}/${sourceName}`);
      expected.push(source);
    }
  }
  if (stickerPath) {
    if (!path.isAbsolute(stickerPath)) throw new Error('STICKER_PATH');
    const stat = await fs.stat(stickerPath);
    if (!stat.isFile() || stat.size > 16 * 1024 * 1024) throw new Error('STICKER_SIZE');
    add('doki-sticker', 'js', stickerScript(await fs.readFile(stickerPath), stickerCss));
  }
  const nextImports = [], seen = new Set();
  for (const entry of imports) {
    const file = localImport(entry);
    const managed = managedKind(file, directory);
    if ((smoothPath && (isSmoothSource(file) || managed === 'smooth')) || (manageSticker && managed === 'sticker')) continue;
    let stat;
    try { stat = await fs.stat(file); }
    catch (error) {
      if (managed && error.code === 'ENOENT') throw new Error('MANAGED_ASSET_MISSING', { cause: error });
      throw error;
    }
    if (!stat.isFile()) throw new Error('LOCAL_IMPORT_REQUIRED');
    if (!seen.has(key(file))) { seen.add(key(file)); nextImports.push(entry); }
  }
  for (const asset of assets) nextImports.push(asset.uri);
  nextImports.push(...smoothImports);
  return { imports: nextImports, assets, expected, customSticker: Boolean(stickerPath), smooth: Boolean(smoothPath) };
}

async function writeAssets(recipe) {
  for (const asset of recipe.assets) {
    await fs.mkdir(path.dirname(asset.file), { recursive: true, mode: 0o700 });
    await fs.writeFile(asset.file, asset.content, { mode: 0o600 });
  }
}

async function verifyInjection(appRoot, recipe) {
  for (const directory of ['electron-browser/workbench', 'electron-browser', 'electron-sandbox/workbench', 'electron-sandbox']) {
    for (const name of ['workbench-dev.html', 'workbench.esm.html', 'workbench.html', 'workbench-apc-extension.html']) {
      let html;
      try { html = await fs.readFile(path.join(appRoot, 'out/vs/code', directory, name), 'utf8'); }
      catch (error) { if (error.code === 'ENOENT') continue; throw error; }
      if (!html.includes('VSCODE-CUSTOM-CSS-START') || recipe.assets.some(asset => !html.includes(asset.content.toString('utf8'))) ||
          (recipe.expected || []).some(source => !html.includes(source))) {
        throw new Error('INJECTION_NOT_APPLIED');
      }
      return;
    }
  }
  throw new Error('INJECTION_NOT_APPLIED');
}

module.exports = { prepareAssets, writeAssets, verifyInjection, stickerScript, stickerDeclarations, imageMime };
