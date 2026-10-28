'use strict';

const vscode = require('vscode');
const { TARGETS, fingerprint, makePlan, needsReminder, runPlan } = require('./core');
const { snapshot, withLock } = require('./backup');
const { prepareAssets, writeAssets, verifyInjection } = require('./assets');
const getStrings = require('./strings');

function activate(context) {
  const text = getStrings(vscode.env.language);
  const output = vscode.window.createOutputChannel('Appearance Restore');
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 20);
  status.text = '$(paintcan) Appearance Restore';
  status.tooltip = text.restore;
  status.command = 'appearanceRestore.restore';
  context.subscriptions.push(output, status);
  let running = false;

  const installed = () => Object.fromEntries(TARGETS.flatMap(target => {
    const extension = vscode.extensions.getExtension(target.id);
    return extension ? [[target.id, extension.packageJSON.version]] : [];
  }));
  const current = () => fingerprint(vscode.version, vscode.env.appRoot, installed());
  const state = () => context.globalState.get('state', {});
  const write = async patch => context.globalState.update('state', { ...state(), ...patch });
  const log = message => output.appendLine(`${new Date().toISOString()} ${message}`);
  const backups = () => vscode.env.openExternal(context.globalStorageUri);

  async function preflight(plan) {
    const configuration = vscode.workspace.getConfiguration();
    const keys = new Set();
    for (const target of plan) {
      const declared = vscode.extensions.getExtension(target.id)?.packageJSON.contributes?.configuration || [];
      for (const group of Array.isArray(declared) ? declared : [declared]) {
        for (const key of Object.keys(group.properties || {})) keys.add(key);
      }
      if (target.id === 'illixion.vscode-vibrancy-continued') {
        for (const key of ['workbench.colorCustomizations', 'workbench.colorTheme', 'window.titleBarStyle']) keys.add(key);
      }
    }
    for (const key of keys) {
      const values = configuration.inspect(key);
      if (values && ['workspaceValue', 'workspaceFolderValue', 'workspaceLanguageValue', 'workspaceFolderLanguageValue']
        .some(scope => values[scope] !== undefined)) throw new Error(`${text.globalOnly} (${key})`);
    }
    const config = vscode.workspace.getConfiguration('vscode_custom_css');
    const originalImports = config.get('imports', []);
    const customSticker = plan.some(target => target.id === 'unthrottled.doki-theme') ?
      vscode.workspace.getConfiguration('doki').get('sticker.path', '') : '';
    const recipe = plan.some(target => target.id === 'be5invis.vscode-custom-css') ? await prepareAssets({
      imports: originalImports,
      storage: context.globalStorageUri.fsPath,
      smoothPath: plan.some(target => target.id === 'gental.smoothui') ? vscode.extensions.getExtension('gental.smoothui').extensionPath : undefined,
      stickerPath: customSticker,
      manageSticker: plan.some(target => target.id === 'unthrottled.doki-theme'),
      stickerCss: vscode.workspace.getConfiguration('doki').get('sticker.css', ''),
    }) : { imports: originalImports, assets: [], expected: [] };
    if (plan.some(target => target.id === 'be5invis.vscode-custom-css') && !recipe.imports.length) throw new Error(text.badImport);
    return { recipe, originalImports, originalGlobalImports: config.inspect('imports')?.globalValue };
  }

  async function restore() {
    if (running) return vscode.window.showInformationMessage(text.already);
    if (!vscode.workspace.isTrusted) return vscode.window.showWarningMessage(text.trusted);
    running = true;
    try {
      const versions = installed();
      const available = TARGETS.filter(target => versions[target.id]);
      if (!available.length) return await vscode.window.showInformationMessage(text.missing);
      const previous = context.globalState.get('selected');
      const chosen = await vscode.window.showQuickPick(available.map(target => ({
        label: target.name,
        description: versions[target.id],
        detail: target.optIn ? text.checksum : target.managed ? text.smooth : target.command,
        picked: Array.isArray(previous) ? previous.includes(target.id) ||
          (target.managed && context.globalState.get('selectionVersion', 1) < 2) : !target.optIn,
        id: target.id,
      })), { canPickMany: true, title: 'Appearance Restore', placeHolder: text.select, ignoreFocusOut: true });
      if (!chosen?.length) return;
      const plan = makePlan(chosen.map(item => item.id), versions, {
        customSticker: Boolean(vscode.workspace.getConfiguration('doki').get('sticker.path', '')),
      });
      if (await vscode.window.showWarningMessage(text.confirm, {
        modal: true, detail: `${plan.map(target => target.name).join(' → ')}\n\n${text.detail}`,
      }, text.restore) !== text.restore) return;
      const { recipe, originalImports, originalGlobalImports } = await preflight(plan);
      await context.globalState.update('selected', plan.map(target => target.id));
      await context.globalState.update('selectionVersion', 2);
      const identity = current();
      const result = await withLock(context.globalStorageUri.fsPath, async () => {
        const directory = await snapshot(vscode.env.appRoot, context.globalStorageUri.fsPath, {
          version: vscode.version,
          fingerprint: identity,
          extensions: Object.fromEntries(plan.map(target => [target.id, versions[target.id]])),
          configuration: { imports: originalImports, globalImports: originalGlobalImports ?? null },
        });
        log(`${text.backup}: ${directory}`);
        let cssApplied = false, importsUpdated = false;
        const revertUnusedImports = async () => {
          const config = vscode.workspace.getConfiguration('vscode_custom_css');
          if (importsUpdated && !cssApplied && JSON.stringify(config.get('imports', [])) === JSON.stringify(recipe.imports)) {
            await config.update('imports', originalGlobalImports, vscode.ConfigurationTarget.Global);
            log('Restored previous User imports after an incomplete CSS step.');
          }
        };
        try {
          await writeAssets(recipe);
          if (JSON.stringify(recipe.imports) !== JSON.stringify(originalImports)) {
            await vscode.workspace.getConfiguration('vscode_custom_css').update('imports', recipe.imports, vscode.ConfigurationTarget.Global);
            importsUpdated = true;
          }
          return await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: text.progress, cancellable: false },
          async progress => {
            const result = await runPlan(plan, {
              onStep: async target => { log(`Starting ${target.id} ${versions[target.id]}`); progress.report({ message: target.name }); },
              execute: async target => {
                if (target.managed || (target.id === 'unthrottled.doki-theme' && recipe.customSticker)) {
                  log(target.managed ? 'Prepared current Smooth UI imports.' : 'Prepared offline custom sticker from Doki User settings.');
                  return { background: false };
                }
                const extension = vscode.extensions.getExtension(target.id);
                if (!extension) throw new Error(`${text.missingCommand}: ${target.name}`);
                await extension.activate();
                if (!(await vscode.commands.getCommands(true)).includes(target.command)) throw new Error(`${text.missingCommand}: ${target.name}`);
                await vscode.commands.executeCommand(target.command);
                if (target.id === 'be5invis.vscode-custom-css') {
                  await verifyInjection(vscode.env.appRoot, recipe);
                  cssApplied = true;
                  log('Verified Custom CSS injection, Smooth UI sources and managed sticker markers.');
                }
                log(`Command returned: ${target.command}`);
              },
              confirmBackground: async () => await vscode.window.showInformationMessage(text.doki, text.done, text.stop) === text.done,
            });
            if (!result.completed) {
              log(`Stopped at ${result.stoppedAt}`);
              await revertUnusedImports();
              return result;
            }
            await write({ completed: identity, snooze: undefined });
            status.hide();
            log('Restoration commands completed; visual verification requires a full editor restart.');
            return result;
          });
        } catch (error) {
          await revertUnusedImports();
          throw error;
        }
      });
      if (result.completed) void vscode.window.showInformationMessage(text.complete);
      else void vscode.window.showWarningMessage(text.stopped);
    } catch (error) {
      log(error.stack || String(error));
      const action = await vscode.window.showErrorMessage(error.code === 'RESTORE_LOCKED' ? text.busy :
        `${text.failed} ${text[error.message] || error.message}`, text.log, text.backups);
      if (action === text.log) output.show(true);
      if (action === text.backups) await backups();
    } finally {
      running = false;
    }
  }

  async function check(manual = false) {
    if (running) return;
    const identity = current();
    if (!state().baseline) await write({ baseline: identity });
    if (!needsReminder(identity, state(), Date.now()) && !manual) return;
    if (state().baseline === identity || state().completed === identity) {
      if (manual && await vscode.window.showInformationMessage(text.unchanged, text.restore) === text.restore) await restore();
      return;
    }
    status.show();
    if (!manual && !vscode.workspace.getConfiguration('appearanceRestore').get('notifyAfterUpdate', true)) return;
    const choice = await vscode.window.showInformationMessage(text.updated, text.restore, text.later);
    if (choice === text.restore) await restore();
    else await write({ snooze: { fingerprint: identity, until: Date.now() + 24 * 60 * 60 * 1000 } });
  }

  context.subscriptions.push(
    vscode.commands.registerCommand('appearanceRestore.restore', restore),
    vscode.commands.registerCommand('appearanceRestore.check', () => check(true)),
    vscode.commands.registerCommand('appearanceRestore.backups', backups),
    vscode.commands.registerCommand('appearanceRestore.log', () => output.show(true)),
  );
  const timer = setTimeout(() => check().catch(error => log(error.stack || String(error))), 10000);
  context.subscriptions.push({ dispose: () => clearTimeout(timer) });
}

module.exports = { activate };
