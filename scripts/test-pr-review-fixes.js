'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  AUDIO_SESSION_EVENTS,
  AudioSessionStateMachine
} = require('../src/core/audio-session');
const MobileSyncService = require('../src/services/mobile-sync.service');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

function testRepeatedSessionGeneration() {
  const transitions = [];
  const machine = new AudioSessionStateMachine({
    onTransition: (transition) => transitions.push(transition)
  });

  machine.dispatch({ type: AUDIO_SESSION_EVENTS.START_REQUESTED });
  machine.dispatch({ type: AUDIO_SESSION_EVENTS.RESET });
  machine.dispatch({ type: AUDIO_SESSION_EVENTS.START_REQUESTED });

  assert.equal(transitions[0].generation, 1);
  assert.equal(transitions[2].generation, 2);
  assert.equal(transitions[2].generation, machine.getSnapshot().generation);
}

function testReviewFixContracts() {
  const audioSource = read('src/core/audio-session.js');
  const mainSource = read('main.js');
  const speechSource = read('src/services/speech.service.js');
  const packageSource = read('package.json');
  const onboardingSource = read('onboarding.js');
  const setupSource = read('setup.sh');
  const mobileSource = read('src/services/mobile-sync.service.js');
  const workerSource = read('scripts/faster-whisper-worker.py');
  const openAiWorkerSource = read('scripts/whisper-worker.py');
  const cppWorkerSource = read('scripts/whisper-cpp-worker.py');
  const cpuSource = read('scripts/detect-cpu.py');
  const testSpeechSource = read('scripts/test-speech.js');
  const mainWindowSource = read('src/ui/main-window.js');

  assert(audioSource.includes('[AUDIO_SESSION_STATES.ERROR]: Object.freeze({'));
  assert(mainSource.includes('AUDIO_SESSION_EVENTS.CAPTURE_STOPPED'));
  assert(speechSource.includes('fs.existsSync(launch.model)'));
  assert(packageSource.includes('"test:build:win"'));
  assert(!packageSource.includes('"postbuild:win"'));
  assert(onboardingSource.includes('if (command)'));
  assert(cpuSource.includes('{"model name", "hardware"}'));
  assert(workerSource.includes('isinstance(message, dict)'));
  assert(openAiWorkerSource.includes('isinstance(request, dict)'));
  assert(cppWorkerSource.includes('selected_device = _select_vulkan_device(args.device)'));
  assert(testSpeechSource.includes("status.effectiveSettings.whisperEngine"));
  assert(!testSpeechSource.includes("JSON.stringify(status.effectiveSettings"));
  assert(setupSource.includes('VALUE="$value" perl'));
  assert(setupSource.includes('"$GPU_DETECTED_DEVICE" == "cuda" || "$WHISPER_FASTER_DEVICE" == "cuda"'));
  assert(mobileSource.includes('crypto.timingSafeEqual'));
  assert(mobileSource.includes('Set-Cookie'));
  assert(mobileSource.includes('\\.'));
  assert(speechSource.includes('this.isFinalizing = false;'));
  assert(mainWindowSource.includes('this.handleRecordingStopped();'));
  assert(mainWindowSource.includes('MAX_CAPTURE_RESTART_ATTEMPTS'));
  const restartLimitStart = mainWindowSource.indexOf('if (this._captureRestartCount >= MAX_CAPTURE_RESTART_ATTEMPTS)');
  const restartLimitEnd = mainWindowSource.indexOf('const restartPromise =', restartLimitStart);
  const restartLimitBlock = mainWindowSource.slice(restartLimitStart, restartLimitEnd);
  assert(restartLimitBlock.includes('stopSpeechRecognition'));
  assert(restartLimitBlock.indexOf('stopSpeechRecognition') < restartLimitBlock.indexOf('handleRecordingStopped'));
  const workerTimeout = speechSource.match(/const WHISPER_WORKER_REQUEST_TIMEOUT_MS = (\d+);/);
  assert(workerTimeout && Number(workerTimeout[1]) > 180000);
  assert(mainWindowSource.includes('[...status.checks]'));
}

function testMobileSyncPairing() {
  const service = new MobileSyncService({ logger: { warn() {} } });
  service.token = 'secret-token';
  service.page = '<html>mobile</html>';

  const responses = [];
  const response = {
    writeHead(status, headers) { responses.push({ status, headers }); },
    write() {},
    end(body) { responses.push({ body }); }
  };

  service.handleRequest({
    url: '/?token=secret-token',
    headers: {}
  }, response);
  const cookie = responses.find((entry) => entry.headers?.['Set-Cookie'])?.headers['Set-Cookie'];
  assert(cookie, 'pairing page must establish an HttpOnly token cookie');
  assert.equal(service.isAuthorized('/events', { cookie }, { allowQuery: false }), true);
  assert.equal(service.isAuthorized('/events?token=secret-token', {}, { allowQuery: false }), false);
  assert.equal(service.isAuthorized('/events?token=secret-token', {}, { allowQuery: true }), true);
}

try {
  testRepeatedSessionGeneration();
  testReviewFixContracts();
  testMobileSyncPairing();
  console.log('PR review fix tests: passed');
} catch (error) {
  console.error('PR review fix tests: failed', error);
  process.exitCode = 1;
}
