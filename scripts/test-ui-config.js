'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const settings = read('settings.html');
const controller = read('src/ui/settings-window.js');
const main = read('main.js');
const config = read('src/core/config.js');
const packageJson = JSON.parse(read('package.json'));

for (const id of ['whisperDevice', 'whisperCaptureMode', 'whisperResponseTarget', 'geminiModel', 'geminiThinkingLevel']) {
  assert.match(settings, new RegExp(`id=["']${id}["']`), `settings.html must expose ${id}`);
  assert.match(controller, new RegExp(`getElementById\\(["']${id}["']\\)`), `settings controller must bind ${id}`);
}

for (const model of ['gemini-3.6-flash', 'gemini-3.5-flash-lite']) {
  assert.match(settings, new RegExp(`option value=["']${model}["']`), `settings.html must expose ${model}`);
  assert.match(config, new RegExp(`["']${model}["']`), `config.js must allow ${model}`);
}
for (const level of ['minimal', 'low', 'medium', 'high']) {
  assert.match(settings, new RegExp(`option value=["']${level}["']`), `settings.html must expose ${level}`);
  assert.match(config, new RegExp(`["']${level}["']`), `config.js must allow ${level}`);
}

assert.match(controller, /validateWhisperModelName/);
assert.match(controller, /normalizeWhisperEngine/);
assert.match(controller, /settings\.geminiModel/);
assert.match(controller, /settings\.geminiThinkingLevel/);

assert.match(main, /whisperModel:\s*process\.env\.WHISPER_MODEL\s*\?\?\s*["']small["']/);
assert.match(main, /geminiModel:\s*config\.get\(["']llm\.gemini\.model["']\)/);
assert.match(main, /geminiThinkingLevel:\s*config\.get\(["']llm\.gemini\.generation\.thinkingConfig\.thinkingLevel["']\)/);
assert.match(main, /envUpdates\.GEMINI_MODEL\s*=/);
assert.match(main, /envUpdates\.GEMINI_THINKING_LEVEL\s*=/);
assert(packageJson.scripts['test:all'].includes('test:ui-config'),
  'test:all must execute the UI configuration contract');

function testClearingWhisperModelSendsAnExplicitReset() {
  const whisperModelInput = {
    value: '',
    style: {},
    listeners: new Map(),
    addEventListener(type, handler) {
      this.listeners.set(type, handler);
    },
    dispatch(type) {
      this.listeners.get(type)?.({ target: this });
    }
  };
  const sent = [];
  const document = {
    addEventListener(type, handler) {
      if (type === 'DOMContentLoaded') handler();
    },
    getElementById(id) {
      return id === 'whisperModel' ? whisperModelInput : null;
    },
    querySelectorAll() {
      return [];
    }
  };
  const window = {
    api: {
      send(channel, payload) {
        sent.push({ channel, payload });
      },
      receive() {}
    },
    electronAPI: {}
  };

  vm.runInNewContext(controller, { console, document, window, setTimeout() {} }, {
    filename: path.join(root, 'src/ui/settings-window.js')
  });
  whisperModelInput.dispatch('change');

  const save = sent.find(({ channel }) => channel === 'save-settings');
  assert(save, 'clearing the model must trigger a save');
  assert.equal(save.payload.whisperModel, '',
    'clearing the model must send an explicit empty value');
}

testClearingWhisperModelSendsAnExplicitReset();

console.log('UI configuration contract tests passed');
