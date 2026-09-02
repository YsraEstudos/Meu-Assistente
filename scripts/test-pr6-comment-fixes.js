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

function loadPreloadApi() {
  const exposed = {};
  const posted = [];
  const ipcMessages = [];

  class FakePort {
    constructor(name) {
      this.name = name;
    }
  }

  class FakeMessageChannel {
    constructor() {
      this.port1 = new FakePort('port1');
      this.port2 = new FakePort('port2');
    }
  }

  const window = {
    postMessage(message, targetOrigin, transfer) {
      posted.push({ message, targetOrigin, transfer });
    }
  };
  const ipcRenderer = {
    postMessage(channel, message, transfer) {
      ipcMessages.push({ channel, message, transfer });
    }
  };
  const contextBridge = {
    exposeInMainWorld(name, api) {
      exposed[name] = api;
    }
  };
  const context = vm.createContext({
    console,
    require: () => ({ contextBridge, ipcRenderer }),
    contextBridge,
    ipcRenderer,
    MessageChannel: FakeMessageChannel,
    process: { defaultApp: false, env: {} },
    window
  });
  vm.runInContext(read('preload.js'), context, { filename: 'preload.js' });
  return { api: exposed.electronAPI, ipcMessages, posted };
}

function loadWindowManagerClass() {
  const source = read('src/managers/window.manager.js');
  const classStart = source.indexOf('class WindowManager');
  const exportStart = source.indexOf('module.exports =');
  const context = vm.createContext({
    console,
    require() {
      return {
        BrowserWindow: class {},
        screen: {},
        desktopCapturer: {},
        shell: {},
        get() { return undefined; }
      };
    },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    process: { platform: 'win32' },
    URL,
    Math,
    Number,
    String,
    Date,
    Promise,
    Map,
    WeakSet
  });
  context.logger = { debug() {}, info() {}, warn() {}, error() {} };
  const classSource = `${source.slice(classStart, exportStart)}\nglobalThis.__WindowManager = WindowManager;`;
  vm.runInContext(classSource, context, { filename: 'window.manager.js' });
  return context.__WindowManager;
}

function loadLlmResponseCallbacks() {
  const source = read('llm-response.html');
  const scripts = [...source.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  const script = scripts.at(-1)?.[1];
  assert(script, 'response overlay inline script must be available');

  const callbacks = {};
  const elements = new Map();
  const makeElement = () => {
    const classNames = new Set();
    const element = {
      style: {},
      children: [],
      classList: {
        add: (...names) => names.forEach((name) => classNames.add(name)),
        remove: (...names) => names.forEach((name) => classNames.delete(name)),
        contains: (name) => classNames.has(name)
      },
      addEventListener() {},
      removeEventListener() {},
      appendChild(child) { this.children.push(child); },
      querySelector() { return null; },
      querySelectorAll() { return []; },
      setAttribute() {}
    };
    let textContent = '';
    Object.defineProperty(element, 'textContent', {
      get: () => textContent,
      set: (value) => { textContent = String(value ?? ''); }
    });
    return element;
  };
  const document = {
    readyState: 'loading',
    activeElement: null,
    addEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    createElement: makeElement,
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, makeElement());
      return elements.get(id);
    }
  };
  const electronAPI = {};
  for (const name of [
    'onShowLoading', 'onResponseStart', 'onResponseDelta', 'onResponseEnd',
    'onResponseError', 'onDisplayLlmResponse'
  ]) {
    electronAPI[name] = (callback) => { callbacks[name] = callback; };
  }
  electronAPI.resizeLlmWindowForContent = () => Promise.resolve();
  const context = vm.createContext({
    console,
    document,
    window: {
      electronAPI,
      addEventListener() {}
    },
    setTimeout,
    clearTimeout,
    Promise,
    Object,
    Array,
    String,
    Number,
    Math,
    Date
  });
  vm.runInContext(script, context, { filename: 'llm-response.html' });
  context.initLLMResponseWindow();
  return { callbacks, elements };
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

async function testAudioWorkletUsesConfiguredChunkSize() {
  const { MainWindowUI, context } = loadMainWindowUI();
  const ui = Object.create(MainWindowUI.prototype);
  let nodeOptions = null;
  ui.isRecording = true;
  ui._captureGeneration = 1;
  ui._audioWorkletNode = null;
  ui._connectAudioNodeSilently = () => {};
  context.window.AudioWorkletNode = class {
    constructor(_audioContext, _name, options) {
      nodeOptions = options;
      this.port = {};
    }
  };
  const audioContext = { audioWorklet: { addModule: async () => {} } };
  const source = { connect() {} };
  const stream = { getAudioTracks: () => [] };

  assert.equal(await ui._tryStartAudioWorkletCapture(audioContext, source, stream, 1, 4096), true);
  assert.equal(nodeOptions.processorOptions.bufferSize, 4096,
    'AudioWorklet must receive the configured capture chunk size');
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

function testQueuedAudioBufferSurvivesActiveWorkletFlush() {
  const { MainWindowUI, context } = loadMainWindowUI();
  const ui = Object.create(MainWindowUI.prototype);
  const sent = [];
  ui.isRecording = false;
  ui._captureGeneration = 7;
  ui._audioWorkletFlushState = { generation: 7 };
  ui._audioPort = null;
  ui._captureStats = null;
  context.window.electronAPI = {
    sendAudioChunk(buffer) { sent.push(buffer); }
  };

  ui._handleAudioWorkletMessage(new ArrayBuffer(4), 7);
  assert.equal(sent.length, 1, 'a queued worklet buffer must be accepted while its generation is flushing');

  ui._audioWorkletFlushState = null;
  ui._handleAudioWorkletMessage(new ArrayBuffer(4), 7);
  assert.equal(sent.length, 1, 'stopped audio must still be rejected after the flush window closes');
}

function testPreloadTransfersAudioPortToBothContexts() {
  const { api, ipcMessages, posted } = loadPreloadApi();
  const result = api.openAudioTransport();

  assert.equal(result, true, 'audio transport setup must report that the handoff was requested');
  assert.equal(ipcMessages.length, 1);
  assert.equal(ipcMessages[0].channel, 'audio-port');
  assert.equal(ipcMessages[0].message, null);
  assert.equal(ipcMessages[0].transfer[0].name, 'port2');
  assert.equal(posted.length, 1);
  assert.equal(posted[0].message, 'opencluely-audio-port');
  assert.equal(posted[0].targetOrigin, '*');
  assert.equal(posted[0].transfer[0].name, 'port1');
}

async function testMainWindowConsumesAudioPortHandoff() {
  const { MainWindowUI, context } = loadMainWindowUI();
  const ui = Object.create(MainWindowUI.prototype);
  ui._pendingAudioPorts = [];
  ui._audioPortWaiters = [];
  const port = { postMessage() {} };

  const waiting = ui._waitForAudioTransportPort();
  ui._handleAudioPortMessage({
    source: context.window,
    data: 'opencluely-audio-port',
    ports: [port]
  });

  assert.equal(await waiting, port, 'the transferred renderer port must be delivered to the capture flow');
}

async function testConcurrentLlmStreamsKeepIndependentBuffers() {
  const { callbacks, elements } = loadLlmResponseCallbacks();
  const start = callbacks.onResponseStart;
  const delta = callbacks.onResponseDelta;
  assert.equal(typeof start, 'function');
  assert.equal(typeof delta, 'function');

  start(null, { messageId: 'stream-a' });
  delta(null, { messageId: 'stream-a', delta: 'A1' });
  start(null, { messageId: 'stream-b' });
  callbacks.onResponseEnd(null, { messageId: 'stream-a', response: 'A final' });
  assert.equal(elements.get('loading').classList.contains('hidden'), false,
    'an older stream ending must not hide the active stream');
  delta(null, { messageId: 'stream-b', delta: 'B1' });
  delta(null, { messageId: 'stream-a', delta: 'A2' });

  assert.equal(elements.get('full-markdown').textContent, 'B1',
    'a delta from an older stream must not replace the active stream');
  delta(null, { messageId: 'stream-b', delta: 'B2' });
  assert.equal(elements.get('full-markdown').textContent, 'B1B2',
    'the active stream must retain its own accumulated text');

  const secondRun = loadLlmResponseCallbacks();
  secondRun.callbacks.onResponseStart(null, { messageId: 'older' });
  secondRun.callbacks.onResponseDelta(null, { messageId: 'older', delta: 'O1' });
  secondRun.callbacks.onResponseStart(null, { messageId: 'newer' });
  secondRun.callbacks.onResponseDelta(null, { messageId: 'newer', delta: 'N1' });
  secondRun.callbacks.onResponseEnd(null, { messageId: 'newer', response: '' });
  secondRun.callbacks.onResponseDelta(null, { messageId: 'older', delta: 'O2' });
  assert.equal(secondRun.elements.get('full-markdown').textContent, 'O1O2',
    'an older stream must resume independently when the active stream finishes first');
}

async function testRecordingStartBroadcastWaitsForChatCreation() {
  const WindowManager = loadWindowManagerClass();
  const manager = Object.create(WindowManager.prototype);
  manager.isRecording = false;
  const broadcasts = [];
  let releaseChat;
  manager.showChatWindow = () => new Promise((resolve) => { releaseChat = resolve; });
  manager.broadcastToAllWindows = (channel) => broadcasts.push(channel);

  const started = manager.handleRecordingStarted();
  assert.equal(typeof started?.then, 'function', 'recording start must await lazy chat creation');
  assert.deepEqual(broadcasts, [], 'recording state must not broadcast before chat creation settles');

  releaseChat();
  await started;
  assert.deepEqual(broadcasts, ['recording-started']);
}

function testSourceContracts() {
  const preload = read('preload.js');
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

  assert.match(preload, /window\.postMessage\(['"]opencluely-audio-port['"], ['"]\*['"], \[channel\.port1\]\)/,
    'the preload must relay the renderer port through window.postMessage');
  assert.match(mainWindow, /_waitForAudioTransportPort\(\)/,
    'the renderer must wait for the transferred port instead of receiving it through contextBridge');
  assert.match(manager, /async handleRecordingStarted\(\)[\s\S]*?await this\.showChatWindow\(\)/,
    'recording-started must wait for lazy chat creation');

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
  testAudioWorkletUsesConfiguredChunkSize,
  testAudioTailWaitsForMainProcessAck,
  testQueuedAudioBufferSurvivesActiveWorkletFlush,
  testPreloadTransfersAudioPortToBothContexts,
  testMainWindowConsumesAudioPortHandoff,
  testConcurrentLlmStreamsKeepIndependentBuffers,
  testRecordingStartBroadcastWaitsForChatCreation,
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
