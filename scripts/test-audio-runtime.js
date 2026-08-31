'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const preload = read('preload.js');
const main = read('main.js');
const mainWindow = read('src/ui/main-window.js');

assert.match(preload, /openAudioTransport\s*:/, 'preload must expose the transferable audio transport');
assert.match(main, /ipcMain\.on\(['"]audio-port['"]/, 'main must accept the renderer MessagePort');
assert.match(main, /_handleBoundedRendererAudioPayload/, 'main must bound renderer audio payloads');
assert.match(mainWindow, /AudioWorkletNode/, 'renderer must prefer AudioWorklet capture');
assert.match(mainWindow, /_sendRendererAudioBuffer/, 'renderer must share one transport send path');
assert.match(read('src/ui/audio-capture.worklet.js'), /registerProcessor\(['"]opencluely-audio-capture['"]/, 'audio worklet must register its processor');
assert.match(read('src/core/performance.js'), /snapshot\s*\(/, 'performance tracker must expose a snapshot for diagnostics');

console.log('Audio runtime integration checks passed');
