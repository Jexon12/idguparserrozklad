const fs = require('fs');
const vm = require('vm');

function target(extra = {}) {
    const listeners = {};
    return Object.assign({
        addEventListener(name, fn) { (listeners[name] ||= new Set()).add(fn); },
        removeEventListener(name, fn) { listeners[name]?.delete(fn); },
        emit(name) { [...(listeners[name] || [])].forEach(fn => fn()); }
    }, extra);
}

function setup(waiting = true, installing = null) {
    const nodes = [];
    const worker = target({ state: 'installed', postMessage: jest.fn() });
    const registration = target({ waiting: waiting ? worker : null, installing });
    const serviceWorker = target();
    const reload = jest.fn();
    const sandbox = {
        window: { ScheduleApp: {}, location: { reload } }, navigator: { serviceWorker }, setTimeout, clearTimeout,
        document: {
            getElementById: id => nodes.find(node => node.id === id),
            createElement: tag => target({ tag, setAttribute() {}, append() {} }),
            body: { append(node) { nodes.push(node); } }
        }
    };
    const create = sandbox.document.createElement;
    const created = [];
    sandbox.document.createElement = tag => { const node = create(tag); created.push(node); return node; };
    vm.runInNewContext(fs.readFileSync(require.resolve('../js/app-updates.js'), 'utf8'), sandbox);
    sandbox.window.ScheduleApp.watchForUpdate(registration);
    return { worker, registration, serviceWorker, reload, button: () => created.find(node => node.tag === 'button'), label: () => created.find(node => node.tag === 'span') };
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test('click activates waiting worker and reloads only once', () => {
    const w = setup();
    w.button().emit('click');
    w.button().emit('click');
    expect(w.worker.postMessage).toHaveBeenCalledTimes(1);
    expect(w.worker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    expect(w.button().disabled).toBe(true);
    w.serviceWorker.emit('controllerchange');
    w.worker.state = 'activated'; w.worker.emit('statechange');
    expect(w.reload).toHaveBeenCalledTimes(1);
});

test('stale notice reloads when another tab already activated the update', () => {
    const w = setup();
    w.registration.waiting = null;
    w.serviceWorker.emit('controllerchange');
    expect(w.reload).not.toHaveBeenCalled();
    w.button().emit('click');
    expect(w.reload).toHaveBeenCalledTimes(1);
});

test('worker activation reloads even if controllerchange is not delivered', () => {
    const w = setup();
    w.button().emit('click');
    w.worker.state = 'activated'; w.worker.emit('statechange');
    expect(w.reload).toHaveBeenCalledTimes(1);
});

test('timeout allows retry and never silently reloads later', () => {
    const w = setup();
    w.button().emit('click');
    jest.advanceTimersByTime(12000);
    expect(w.button().disabled).toBe(false);
    expect(w.label().textContent).toContain('Не вдалося');
    w.serviceWorker.emit('controllerchange');
    expect(w.reload).not.toHaveBeenCalled();
    w.button().emit('click');
    expect(w.worker.postMessage).toHaveBeenCalledTimes(2);
    w.serviceWorker.emit('controllerchange');
    expect(w.reload).toHaveBeenCalledTimes(1);
});

test('postMessage failures show a retry action', () => {
    const w = setup();
    w.worker.postMessage.mockImplementation(() => { throw Error('unavailable'); });
    w.button().emit('click');
    expect(w.button().disabled).toBe(false);
    expect(w.label().textContent).toContain('Не вдалося');
    expect(w.reload).not.toHaveBeenCalled();
});

test('observes a worker that was installing before registration resolved', () => {
    const installing = target({ state: 'installing' });
    const w = setup(false, installing);
    expect(w.button()).toBeUndefined();
    w.registration.waiting = w.worker;
    installing.emit('statechange');
    expect(w.button()).toBeDefined();
});
