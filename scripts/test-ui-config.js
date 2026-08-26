'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const settings = read('settings.html');
const controller = read('src/ui/settings-window.js');

for (const id of ['whisperDevice', 'whisperCaptureMode', 'whisperResponseTarget', 'geminiModel', 'geminiThinkingLevel']) {
  assert.match(settings, new RegExp(`id=["']${id}["']`), `settings.html must expose ${id}`);
  assert.match(controller, new RegExp(`getElementById\\(["']${id}["']\\)`), `settings controller must bind ${id}`);
}

assert.match(controller, /validateWhisperModelName/);
assert.match(controller, /normalizeWhisperEngine/);
assert.match(controller, /settings\.geminiModel/);
assert.match(controller, /settings\.geminiThinkingLevel/);

console.log('UI configuration contract tests passed');
