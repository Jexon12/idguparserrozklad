const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { compile } = require('@vue/compiler-dom');

test('main Vue template compiles, including new dialogs and backup controls', () => {
    const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
    const start = html.indexOf('<div id="app"');
    const end = html.indexOf('<!-- End of #app -->');
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    expect(() => compile(html.slice(start, end))).not.toThrow();
});

test('shared native dialog template compiles and synchronizes open state', () => {
    const sandbox = { window: {} };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js/components/app-modal-shell.js'), 'utf8'), sandbox);
    const component = sandbox.window.AppModalShellComponent;
    expect(() => compile(component.template)).not.toThrow();
    const dialog = { open: false, showModal: jest.fn(), close: jest.fn() };
    const ctx = { open: true, $refs: { dialog }, $nextTick: fn => fn() };
    component.methods.syncOpen.call(ctx);
    expect(dialog.showModal).toHaveBeenCalledTimes(1);
    dialog.open = true; ctx.open = false;
    component.methods.syncOpen.call(ctx);
    expect(dialog.close).toHaveBeenCalledTimes(1);
});
