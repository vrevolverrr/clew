// Plugin code runs in Obsidian's renderer and uses `window` timers; Node suites need the same global.
if (!('window' in globalThis)) {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: globalThis,
    writable: true,
  });
}
