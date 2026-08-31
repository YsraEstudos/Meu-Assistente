'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

function loadAudioWorkletProcessor() {
  const source = read('src/ui/audio-capture.worklet.js');
  let ProcessorClass = null;

  class FakeAudioWorkletProcessor {
    constructor() {
      this.port = {
        messages: [],
        onmessage: null,
        postMessage: (data) => this.port.messages.push(data)
      };
    }
  }

  const context = vm.createContext({
    AudioWorkletProcessor: FakeAudioWorkletProcessor,
    Float32Array,
    Int16Array,
    Math,
    registerProcessor(_name, implementation) {
      ProcessorClass = implementation;
    }
  });
  vm.runInContext(source, context, { filename: 'audio-capture.worklet.js' });
  assert(ProcessorClass, 'worklet processor must register');
  return ProcessorClass;
}

function testAudioWorkletFlushesPartialTail() {
  const ProcessorClass = loadAudioWorkletProcessor();
  const processor = new ProcessorClass({ processorOptions: { bufferSize: 8 } });
  const input = new Float32Array([0.1, -0.2, 0.3, -0.4, 0.5, -0.6]);
  const output = new Float32Array(input.length);

  processor.process([[input]], [[output]]);
  assert.equal(processor.port.messages.length, 0, 'partial input should remain batched until flush');
  assert.equal(typeof processor.port.onmessage, 'function', 'worklet must accept a flush command');

  processor.port.onmessage({ data: { type: 'flush' } });
  const tail = processor.port.messages.find((message) => message?.type === 'audio-tail');
  assert(tail?.buffer instanceof ArrayBuffer, 'flush must emit the pending PCM tail');
  assert.equal(new Int16Array(tail.buffer).length, input.length);
  assert(processor.port.messages.some((message) => message?.type === 'flush-complete'));
}

function loadMainWindowUI() {
  const source = `${read('src/ui/main-window.js')}\n;globalThis.__MainWindowUI = MainWindowUI;`;
  const context = vm.createContext({
    console,
    URL,
    window: {},
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    Promise,
    Math,
    Number,
    String,
    ArrayBuffer,
    Int16Array
  });
  vm.runInContext(source, context, { filename: 'main-window.js' });
  context.document = { baseURI: 'file:///app/index.html' };
  return { MainWindowUI: context.__MainWindowUI, context };
}

async function testStaleAudioWorkletStartDoesNotCreateNode() {
  const { MainWindowUI, context } = loadMainWindowUI();
  const ui = Object.create(MainWindowUI.prototype);
  ui.isRecording = true;
  ui._captureGeneration = 1;
  ui._audioWorkletNode = null;
  ui._sendRendererAudioBuffer = () => true;
  ui._connectAudioNodeSilently = () => {};
  ui._restartRendererAudioCapture = () => {};

  let releaseModule;
  let constructed = 0;
  context.window.AudioWorkletNode = class {
    constructor() {
      constructed += 1;
      this.port = {};
    }
    disconnect() {}
  };
  const audioContext = {
    audioWorklet: {
      addModule: () => new Promise((resolve) => { releaseModule = resolve; })
    }
  };
  const source = { connect() {} };
  const stream = { getAudioTracks: () => [] };

  const start = ui._tryStartAudioWorkletCapture(audioContext, source, stream, 1);
  ui.isRecording = false;
  ui._captureGeneration = 2;
  releaseModule();

  assert.equal(await start, false);
  assert.equal(constructed, 0, 'a stale generation must not create an AudioWorkletNode');
  assert.equal(ui._audioWorkletNode, null);
}

async function testAudioTailWaitsForMainProcessAck() {
  const { MainWindowUI } = loadMainWindowUI();
  const ui = Object.create(MainWindowUI.prototype);
  ui.isRecording = false;
  ui._captureGeneration = 7;
  ui._audioWorkletFlushState = null;
  ui._audioTailSequence = 0;
  ui._audioWorkletNode = { port: { postMessage() {} } };
  ui._audioPort = { postMessage() {} };
  ui._sendRendererAudioBuffer = () => true;

  let settled = false;
  const flush = ui._flushAudioWorkletTail().then(() => { settled = true; });
  ui._handleAudioWorkletMessage({ type: 'audio-tail', buffer: new ArrayBuffer(4) }, 7);
  const flushId = ui._audioWorkletFlushState.flushId;
  ui._handleAudioWorkletMessage({ type: 'flush-complete' }, 7);
  await Promise.resolve();
  assert.equal(settled, false, 'worklet completion must still wait for main-process acceptance');

  ui._handleAudioTransportMessage({ type: 'audio-tail-accepted', flushId });
  await flush;
  assert.equal(settled, true);
}

function testSourceContracts() {
  const main = read('main.js');
  const manager = read('src/managers/window.manager.js');
  const capture = read('src/services/capture.service.js');
  const config = read('src/core/config.js');
  const mainWindow = read('src/ui/main-window.js');
  const speechService = read('src/services/speech.service.js');
  const chat = read('chat.html');
  const llmResponse = read('llm-response.html');

  assert.equal((main.match(/this\._audioPorts = new Set\(\)/g) || []).length, 1,
    'recording stop must not discard tracked audio ports');
  assert.match(main, /ipcMain\.on\("audio-port", \(event\) => \{[\s\S]{0,300}?_isAllowedRenderer\(event, \['main'\]\)/,
    'audio-port must reject non-main renderers');
  assert.match(main, /ipcMain\.on\("audio-chunk", \(event, data\) => \{[\s\S]{0,180}?_isAllowedRenderer\(event, \['main'\]\)/,
    'legacy audio chunks must reject non-main renderers');
  assert.match(main, /audio-tail-accepted/,
    'the main process must acknowledge a worklet tail only after handling it');
  assert.match(main, /ipcMain\.on\("speech-capture-drained", \(event\) => \{[\s\S]{0,180}?_isAllowedRenderer\(event, \['main'\]\)/,
    'only the capture renderer may release the main-process drain barrier');

  const rendererDrainTimeout = Number(mainWindow.match(/AUDIO_TAIL_ACK_TIMEOUT_MS\s*=\s*(\d+)/)?.[1]);
  const mainDrainTimeout = Number(speechService.match(/RENDERER_CAPTURE_DRAIN_TIMEOUT_MS\s*=\s*(\d+)/)?.[1]);
  assert(mainDrainTimeout > rendererDrainTimeout,
    'the main drain watchdog must outlive the renderer ACK timeout');

  assert.doesNotMatch(manager, /setPermission(?:Request|Check)Handler/,
    'window creation must not overwrite the centralized permission policy');
  assert.match(manager, /if \(this\._responsePrewarmTimer\) \{\s*clearTimeout\(this\._responsePrewarmTimer\)/,
    'teardown must cancel response-window prewarm');
  assert.match(manager, /async createSettingsWindow\(\) \{\s*return this\._ensureWindow\('settings'/,
    'settings window creation must share the in-flight guard');
  assert.match(manager, /async showChatWindow\(\)[\s\S]*?await this\.ensureChatWindow\(\)/,
    'recording must lazily create the chat window before showing it');

  assert.match(capture, /Requested display .* is unavailable/,
    'an unknown display id must fail instead of capturing the primary display');
  assert.equal((capture.match(/performanceTracker\.end\(trace/g) || []).length, 1,
    'capture performance span must end exactly once');

  assert.match(config, /mobileSync:[\s\S]*?bindHost:/,
    'configuration must expose an explicit LAN bind opt-in');
  assert.match(main, /new MobileSyncService\(\{[\s\S]*?bindHost: config\.get\("mobileSync\.bindHost"\)/,
    'the application must pass the configured bind host to mobile sync');

  assert.match(mainWindow,
    /onRecordingCaptureStopped\(async \(\) => \{[\s\S]*?await this\.handleRecordingStopped\(\);[\s\S]*?confirmAudioCaptureStopped\(\)/,
    'the main process drain acknowledgement must wait for the renderer tail flush');
  assert.match(mainWindow, /await this\._stopRendererAudioCapture\(\);[\s\S]*?await this\._startRendererAudioCapture\(\)/,
    'capture restart must finish stopping the previous generation first');

  for (const listener of ['onResponseStart', 'onResponseDelta', 'onResponseEnd', 'onResponseError']) {
    assert.match(chat, new RegExp(`whysperAPI\\.${listener}`),
      `the loaded chat page must consume ${listener}`);
    assert.match(llmResponse, new RegExp(`electronAPI\\.${listener}`),
      `the loaded response overlay must consume ${listener}`);
  }

  const resizeCall = mainWindow.indexOf('window.electronAPI.resizeWindow(width, height)');
  const resizeCache = mainWindow.indexOf('this._lastWindowSize = { width, height }', resizeCall);
  assert(resizeCall >= 0 && resizeCache > resizeCall,
    'window size must be cached only after a successful resize');

  const navigationStart = mainWindow.indexOf('navigateSkill(direction)');
  const navigationEnd = mainWindow.indexOf('showSkillChangeNotification(skill, direction)', navigationStart);
  const navigation = mainWindow.slice(navigationStart, navigationEnd);
  const successBranch = navigation.indexOf('if (result && result.success === false) return;');
  const notification = navigation.indexOf('this.showSkillChangeNotification(newSkill, direction);');
  assert(successBranch >= 0 && notification > successBranch,
    'skill notification must run only in a successful update path');
}

const tests = [
  testAudioWorkletFlushesPartialTail,
  testStaleAudioWorkletStartDoesNotCreateNode,
  testAudioTailWaitsForMainProcessAck,
  testSourceContracts
];

(async () => {
  const failures = [];
  for (const test of tests) {
    try {
      await test();
    } catch (error) {
      failures.push({ name: test.name, error });
    }
  }

  if (failures.length) {
    for (const { name, error } of failures) {
      console.error(`FAIL ${name}: ${error.message}`);
    }
    process.exitCode = 1;
  } else {
    console.log('PR #6 comment regression tests: passed');
  }
})();
