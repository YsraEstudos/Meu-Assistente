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
assert.match(main, /config\.set\(["']llm\.gemini\.fallbackModels["'],\s*supportedGeminiModels\.filter\(\(model\)\s*=>\s*model\s*!==\s*envUpdates\.GEMINI_MODEL\)\)/,
  'changing the Gemini primary model must recompute fallback models');
assert(packageJson.scripts['test:all'].includes('test:ui-config'),
  'test:all must execute the UI configuration contract');

function createSettingsHarness({ engine = 'whisper-cpp', model = '' } = {}) {
  const makeInput = (value) => ({
    value,
    style: {},
    listeners: new Map(),
    addEventListener(type, handler) {
      this.listeners.set(type, handler);
    },
    dispatch(type) {
      this.listeners.get(type)?.({ target: this });
    }
  });
  const whisperModelInput = makeInput(model);
  const whisperEngineSelect = makeInput(engine);
  const sent = [];
  const document = {
    addEventListener(type, handler) {
      if (type === 'DOMContentLoaded') handler();
    },
    getElementById(id) {
      if (id === 'whisperModel') return whisperModelInput;
      if (id === 'whisperEngine') return whisperEngineSelect;
      return null;
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

  return { whisperModelInput, whisperEngineSelect, sent };
}

function testClearingWhisperModelSendsAnExplicitReset() {
  const { whisperModelInput, sent } = createSettingsHarness({ model: '' });
  whisperModelInput.dispatch('change');

  const save = sent.find(({ channel }) => channel === 'save-settings');
  assert(save, 'clearing the model must trigger a save');
  assert.equal(save.payload.whisperModel, '',
    'clearing the model must send an explicit empty value');
}

function testFasterWhisperAcceptsRepositoryAndLocalReferences() {
  const repositoryHarness = createSettingsHarness({
    engine: 'faster',
    model: 'distil-whisper/distil-large-v3'
  });
  repositoryHarness.whisperModelInput.dispatch('change');
  const repositorySave = repositoryHarness.sent.find(({ channel }) => channel === 'save-settings');
  assert.equal(repositorySave?.payload.whisperModel, 'distil-whisper/distil-large-v3',
    'Faster Whisper must persist Hugging Face repository IDs');

  const localHarness = createSettingsHarness({
    engine: 'faster',
    model: 'C:\\Models\\large-v3'
  });
  localHarness.whisperModelInput.dispatch('change');
  const localSave = localHarness.sent.find(({ channel }) => channel === 'save-settings');
  assert.equal(localSave?.payload.whisperModel, 'C:\\Models\\large-v3',
    'Faster Whisper must persist local model paths');
}

function testEngineChangeResetsIncompatibleModel() {
  for (const engine of ['openai', 'whisper-cpp']) {
    const harness = createSettingsHarness({
      engine: 'faster',
      model: 'distil-whisper/distil-large-v3'
    });
    harness.whisperEngineSelect.value = engine;
    harness.whisperEngineSelect.dispatch('change');

    const saves = harness.sent.filter(({ channel }) => channel === 'save-settings');
    const save = saves.at(-1);
    assert.equal(save?.payload.whisperEngine, engine,
      `changing the engine to ${engine} must persist the selected engine`);
    assert.equal(save?.payload.whisperModel, '',
      `changing to ${engine} must clear the incompatible Faster Whisper model`);
    assert.equal(harness.whisperModelInput.value, '',
      `the UI must not keep displaying a model incompatible with ${engine}`);
  }
}

testClearingWhisperModelSendsAnExplicitReset();
testFasterWhisperAcceptsRepositoryAndLocalReferences();
testEngineChangeResetsIncompatibleModel();

console.log('UI configuration contract tests passed');
