'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { TARGETS } = require('../src/core');
const getStrings = require('../src/strings');

function harness(options = {}) {
  const text = getStrings('en');
  const values = new Map();
  const commands = new Map();
  const events = [];
  const configs = {
    [TARGETS[0].id]: ['vscode_vibrancy.opacity'],
    [TARGETS[1].id]: ['doki.sticker.path'],
    'be5invis.vscode-custom-css': ['vscode_custom_css.imports'],
    'RimuruChan.vscode-fix-checksums-next': ['checksums.autoFix'],
  };
  let timer;
  let imports = options.imports || ['file:///C:/styles/custom.css'];
  const api = {
    version: '1.143.1', env: { appRoot: '/editor', language: 'en', openExternal: async () => events.push('open') },
    workspace: {
      isTrusted: options.trusted !== false,
      getConfiguration: section => ({
        get: (key, fallback) => section === 'vscode_custom_css' && key === 'imports' ?
          imports : section === 'doki' && key === 'sticker.path' ? options.sticker || '' : fallback,
        inspect: key => options.override === key ? { workspaceValue: 'unsafe' } :
          section === 'vscode_custom_css' && key === 'imports' ? { globalValue: options.imports || ['file:///C:/styles/custom.css'] } : {},
        update: async (key, value) => { imports = value; events.push('update-imports'); },
      }),
    },
    extensions: {
      getExtension: id => options.none ? undefined : {
        extensionPath: `/extensions/${id}-1.0.0`,
        packageJSON: { version: '1.0.0', contributes: { configuration: { properties: Object.fromEntries((configs[id] || []).map(key => [key, {}])) } } },
        activate: async () => events.push(`activate:${id}`),
      },
    },
    commands: {
      registerCommand: (id, callback) => { commands.set(id, callback); return { dispose() {} }; },
      getCommands: async () => options.missingCommand ? [] : TARGETS.map(target => target.command),
      executeCommand: async command => {
        events.push(command);
        if (command === options.fail) throw new Error('command failed');
      },
    },
    StatusBarAlignment: { Right: 2 }, ProgressLocation: { Notification: 15 }, ConfigurationTarget: { Global: 1 },
    window: {
      createOutputChannel: () => ({ appendLine: line => events.push(`log:${line}`), show() {}, dispose() {} }),
      createStatusBarItem: () => ({ show() {}, hide() {}, dispose() {} }),
      showQuickPick: async items => options.cancelSelection ? undefined : items.filter(item => options.checksums || item.picked),
      showWarningMessage: async (message, detail) => detail?.modal && !options.cancelConfirmation ? text.restore : undefined,
      showInformationMessage: async message => message === text.doki ? (options.cancelDoki ? text.stop : text.done) : undefined,
      showErrorMessage: async message => { events.push(`error:${message}`); },
      withProgress: async (_, action) => action({ report() {} }),
    },
  };
  const context = {
    subscriptions: [], globalStorageUri: { fsPath: '/storage' },
    globalState: { get: (key, fallback) => values.get(key) ?? fallback, update: async (key, value) => values.set(key, value) },
  };
  const entry = path.join(__dirname, '../src/extension.js');
  const module = { exports: {} };
  const localRequire = name => {
    if (name === 'vscode') return api;
    if (name === './assets') return {
      prepareAssets: async data => {
        if (data.imports.some(uri => uri.startsWith('https:'))) throw new Error('LOCAL_IMPORT_REQUIRED');
        events.push('prepare');
        return { imports: options.rewriteImports ? ['file:///C:/managed/new.js'] : data.imports,
          assets: [], expected: [], customSticker: Boolean(data.stickerPath), smooth: Boolean(data.smoothPath) };
      },
      writeAssets: async () => events.push('write-assets'),
      verifyInjection: async () => { events.push('verify-injection'); if (options.badInjection) throw new Error('INJECTION_NOT_APPLIED'); },
    };
    if (name === './backup') return {
      withLock: async (_, action) => { events.push('lock'); return action(); },
      snapshot: async () => { events.push('snapshot'); return '/backup'; },
    };
    return require(name.startsWith('.') ? path.resolve(path.dirname(entry), name) : name);
  };
  const wrapper = vm.runInNewContext(`(function(require, module, exports) { ${fs.readFileSync(entry, 'utf8')}\n})`, {
    setTimeout: callback => { timer = callback; return 1; }, clearTimeout() {}, URL, Date,
  });
  wrapper(localRequire, module, module.exports);
  module.exports.activate(context);
  return { api, events, values, commands, context, startup: () => timer(), restore: () => commands.get('appearanceRestore.restore')() };
}

test('activation and first startup never patch or change user settings', async () => {
  const h = harness();
  assert.equal(h.commands.size, 4);
  await h.startup();
  assert.ok(h.values.get('state').baseline);
  assert.deepEqual(h.events, []);
});

test('confirmed flow backs up before commands and leaves checksums opt-in', async () => {
  const h = harness();
  await h.restore();
  const called = h.events.filter(event => TARGETS.some(target => target.command === event));
  assert.deepEqual(called, TARGETS.filter(target => !target.optIn && target.command).map(target => target.command));
  assert.ok(h.events.indexOf('snapshot') < h.events.indexOf(called[0]));
  assert.ok(h.values.get('state').completed);
});

test('explicitly selecting checksums runs it last', async () => {
  const h = harness({ checksums: true });
  await h.restore();
  const called = h.events.filter(event => TARGETS.some(target => target.command === event));
  assert.deepEqual(called, TARGETS.filter(target => target.command).map(target => target.command));
});

for (const options of [{ cancelSelection: true }, { cancelConfirmation: true }, { trusted: false }, { none: true }]) {
  test(`cancelled or unavailable flow never backs up or patches: ${JSON.stringify(options)}`, async () => {
    const h = harness(options);
    await h.restore();
    assert.equal(h.events.includes('snapshot'), false);
    assert.equal(h.values.get('state')?.completed, undefined);
  });
}

test('extension failures stop later commands and do not record success', async () => {
  const h = harness({ fail: TARGETS[0].command });
  await h.restore();
  assert.equal(h.events.includes(TARGETS[2].command), false);
  assert.equal(h.values.get('state')?.completed, undefined);
  assert.ok(h.events.some(event => event.startsWith('error:')));
});

test('declining Doki background confirmation stops the flow', async () => {
  const h = harness({ cancelDoki: true });
  await h.restore();
  assert.equal(h.events.includes(TARGETS[2].command), false);
  assert.equal(h.values.get('state')?.completed, undefined);
});

test('workspace-supplied appearance settings cannot trigger editor-wide scripts', async () => {
  const h = harness({ override: 'vscode_custom_css.imports' });
  await h.restore();
  assert.equal(h.events.includes('snapshot'), false);
  assert.ok(h.events.some(event => event.includes('Workspace appearance overrides')));
});

test('remote imports are rejected before any backup or execution', async () => {
  const h = harness({ imports: ['https://example.com/styles.js'] });
  await h.restore();
  assert.equal(h.events.includes('snapshot'), false);
  assert.ok(h.events.some(event => event.includes('existing local CSS/JS file URLs')));
});

test('missing third-party command is an error, not a completed restoration', async () => {
  const h = harness({ missingCommand: true });
  await h.restore();
  assert.equal(h.values.get('state')?.completed, undefined);
  assert.ok(h.events.some(event => event.includes('did not register')));
});

test('all user-facing runtime strings have English and Russian variants', () => {
  const en = getStrings('en'), ru = getStrings('ru-RU');
  assert.deepEqual(Object.keys(en).sort(), Object.keys(ru).sort());
  for (const key of Object.keys(en)) {
    assert.equal(typeof ru[key], 'string');
    assert.notEqual(en[key], ru[key]);
  }
});

test('a configured custom sticker avoids Doki network commands and verifies the injected script', async () => {
  const h = harness({ sticker: 'C:/custom/sticker.png' });
  await h.restore();
  assert.equal(h.events.includes('doki-theme.restore.assets'), false);
  assert.equal(h.events.includes('verify-injection'), true);
  assert.ok(h.values.get('state').completed);
});

test('silent CSS failure does not mark success and restores the previous User imports', async () => {
  const h = harness({ badInjection: true, rewriteImports: true });
  await h.restore();
  assert.equal(h.values.get('state')?.completed, undefined);
  assert.equal(h.events.filter(event => event === 'update-imports').length, 2);
});
