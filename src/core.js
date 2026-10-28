'use strict';

const TARGETS = Object.freeze([
  { id: 'illixion.vscode-vibrancy-continued', name: 'Vibrancy Continued', command: 'extension.installVibrancy' },
  { id: 'unthrottled.doki-theme', name: 'Doki Theme', command: 'doki-theme.restore.assets', background: true },
  { id: 'gental.smoothui', name: 'Smooth UI', managed: true },
  { id: 'be5invis.vscode-custom-css', name: 'Custom CSS and JS', command: 'extension.installCustomCSS' },
  { id: 'RimuruChan.vscode-fix-checksums-next', name: 'Fix Checksums', command: 'fixChecksums.apply', optIn: true },
]);

function fingerprint(version, appRoot, installed) {
  return JSON.stringify([version, appRoot, TARGETS.map(target => [target.id, installed[target.id] || null])]);
}

function makePlan(ids, installed, { customSticker = false } = {}) {
  if (!Array.isArray(ids) || ids.some(id => !TARGETS.some(target => target.id === id))) {
    throw new Error('Unknown restoration target');
  }
  const selected = new Set(ids);
  if ((selected.has('gental.smoothui') && installed['gental.smoothui']) ||
      (customSticker && selected.has('unthrottled.doki-theme') && installed['unthrottled.doki-theme'])) {
    if (!installed['be5invis.vscode-custom-css']) throw new Error('CUSTOM_CSS_REQUIRED');
    selected.add('be5invis.vscode-custom-css');
  }
  return TARGETS.filter(target => selected.has(target.id) && installed[target.id]);
}

function needsReminder(current, state, now) {
  return Boolean(state.baseline && state.baseline !== current &&
    state.completed !== current && !(state.snooze?.fingerprint === current && state.snooze.until > now));
}

async function runPlan(plan, { execute, confirmBackground, onStep }) {
  for (const target of plan) {
    await onStep(target);
    const result = await execute(target);
    // Doki's public command returns before its background work finishes.
    if (target.background && result?.background !== false && !await confirmBackground(target)) return { completed: false, stoppedAt: target.id };
  }
  return { completed: true };
}

module.exports = { TARGETS, fingerprint, makePlan, needsReminder, runPlan };
