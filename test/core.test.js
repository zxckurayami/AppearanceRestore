'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { TARGETS, fingerprint, makePlan, needsReminder, runPlan } = require('../src/core');

const installed = Object.fromEntries(TARGETS.map(target => [target.id, '1.0.0']));

test('only installed allowlisted commands run, in a deterministic order', () => {
  const reversed = TARGETS.map(target => target.id).reverse();
  assert.deepEqual(makePlan(reversed, installed), TARGETS);
  assert.deepEqual(makePlan(reversed, {}), []);
  assert.throws(() => makePlan(['workbench.action.quit'], installed), /Unknown/);
  assert.throws(() => makePlan(null, installed), /Unknown/);
  assert.equal(TARGETS.at(-1).optIn, true);
  assert.equal(TARGETS.at(-1).command, 'fixChecksums.apply');
  assert.equal(TARGETS.find(target => target.id === 'be5invis.vscode-custom-css').command, 'extension.installCustomCSS');
});

test('fingerprint covers editor version, installation path and extension versions', () => {
  const base = fingerprint('1.143.1', '/app/a', installed);
  assert.notEqual(base, fingerprint('1.144.0', '/app/a', installed));
  assert.notEqual(base, fingerprint('1.143.1', '/app/b', installed));
  assert.notEqual(base, fingerprint('1.143.1', '/app/a', { ...installed, [TARGETS[0].id]: '2.0.0' }));
  assert.equal(base, fingerprint('1.143.1', '/app/a', { ...installed, other: '9.0.0' }));
});

test('notifications honor initial baseline, completion, snooze and a newer version', () => {
  assert.equal(needsReminder('b', {}, 10), false);
  assert.equal(needsReminder('a', { baseline: 'a' }, 10), false);
  assert.equal(needsReminder('b', { baseline: 'a' }, 10), true);
  assert.equal(needsReminder('b', { baseline: 'a', completed: 'b' }, 10), false);
  const state = { baseline: 'a', snooze: { fingerprint: 'b', until: 20 } };
  assert.equal(needsReminder('b', state, 10), false);
  assert.equal(needsReminder('b', state, 20), true);
  assert.equal(needsReminder('c', state, 10), true);
});

test('Doki background completion is awaited before later commands', async () => {
  const events = [];
  let acknowledge;
  const ready = new Promise(resolve => { acknowledge = resolve; });
  const plan = makePlan(TARGETS.map(target => target.id), installed);
  const task = runPlan(plan, {
    onStep: async target => events.push(`step:${target.name}`),
    execute: async target => events.push(target.name),
    confirmBackground: async () => { events.push('waiting'); return ready; },
  });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(events.includes('waiting'), true);
  assert.equal(events.includes('Custom CSS and JS'), false);
  acknowledge(true);
  assert.deepEqual(await task, { completed: true });
  assert.ok(events.indexOf('Doki Theme') < events.indexOf('Custom CSS and JS'));
  assert.equal(events.at(-1), 'Fix Checksums');
});

test('cancelling Doki stops restoration before Custom CSS or checksums', async () => {
  const commands = [];
  const result = await runPlan(TARGETS, {
    onStep: async () => {}, execute: async target => commands.push(target.command),
    confirmBackground: async () => false,
  });
  assert.equal(result.completed, false);
  assert.equal(commands.length, 2);
});

test('Smooth UI and custom Doki stickers require and select the CSS loader', () => {
  const smooth = makePlan(['gental.smoothui'], installed);
  assert.deepEqual(smooth.map(target => target.id), ['gental.smoothui', 'be5invis.vscode-custom-css']);
  const sticker = makePlan(['unthrottled.doki-theme'], installed, { customSticker: true });
  assert.equal(sticker.at(-1).id, 'be5invis.vscode-custom-css');
  assert.throws(() => makePlan(['gental.smoothui'], { 'gental.smoothui': '1.0.0' }), /CUSTOM_CSS_REQUIRED/);
});

test('offline custom sticker skips the Doki background prompt', async () => {
  let confirmations = 0;
  const result = await runPlan([TARGETS[1]], {
    onStep: async () => {}, execute: async () => ({ background: false }),
    confirmBackground: async () => { confirmations++; return true; },
  });
  assert.equal(result.completed, true);
  assert.equal(confirmations, 0);
});

test('a thrown extension error stops the sequence', async () => {
  const calls = [];
  await assert.rejects(runPlan(TARGETS, {
    onStep: async () => {},
    execute: async target => { calls.push(target.id); throw new Error('denied'); },
    confirmBackground: async () => true,
  }), /denied/);
  assert.equal(calls.length, 1);
});
