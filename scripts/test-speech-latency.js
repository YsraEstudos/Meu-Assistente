const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const speechService = require('../src/services/speech.service');

function resetService() {
  if (speechService._whisperBatchTimer) {
    clearTimeout(speechService._whisperBatchTimer);
  }
  speechService.runtimeSettings = {};
  speechService.recordingSessionId = 1;
  speechService.provider = 'whisper';
  speechService.effectiveWhisperEngine = 'whisper-cpp';
  speechService.isRecording = false;
  speechService.isFinalizing = false;
  speechService._latencySession = null;
}

function testFastProfileDefaults() {
  resetService();
  assert.equal(speechService._getWhisperLanguage(), 'pt');
  assert.equal(speechService._getPeriodicFlushMs(), 3000);
  assert.equal(speechService._getSilenceHangoverMs(), 600);
  assert.equal(speechService._getAudioChunkSamples(), 2048);
  assert.equal(speechService._getWhisperCppBeamSize(), 1);
  assert.equal(speechService._getWhisperCppBestOf(), 1);
  assert.equal(speechService._getWhisperCppNoFallback(), true);
  assert.equal(speechService._getWhisperCppFlashAttention(), true);
}

function testWorkerDeclaresSpeedFlags() {
  const workerSource = fs.readFileSync(
    path.join(__dirname, 'whisper-cpp-worker.py'),
    'utf8'
  );
  for (const token of [
    '--beam-size',
    '--best-of',
    '--no-fallback',
    '--no-flash-attn',
    '--server-binary',
    'executionMode',
    'backendRequested',
    'backendUsed'
  ]) {
    assert(workerSource.includes(token), `worker must support ${token}`);
  }
}

function testDiscreteGpuSelectionWinsOverIntegrated() {
  const workerPath = path.join(__dirname, 'whisper-cpp-worker.py');
  const python = process.env.PYTHON || 'python';
  const probe = spawnSync(python, [
    '-c',
    [
      'import runpy, sys, types',
      'module = runpy.run_path(sys.argv[1], run_name="worker_module")',
      "module['shutil'].which = lambda _: 'vulkaninfo'",
      "module['subprocess'].run = lambda *args, **kwargs: types.SimpleNamespace(returncode=0, stdout='GPU0:\\n    deviceName = AMD Radeon(TM) Graphics\\n    deviceType = INTEGRATED_GPU\\nGPU1:\\n    deviceName = AMD Radeon RX 6600\\n    deviceType = DISCRETE_GPU\\n', stderr='')",
      "print(module['_select_vulkan_device']('auto'))"
    ].join('; '),
    workerPath
  ], { encoding: 'utf8', windowsHide: true });
  assert.equal(probe.status, 0, probe.stderr || 'GPU selection probe failed');
  assert.equal(probe.stdout.trim(), '1');
}

function testForcedCpuRuntimeIsReportedAsCpu() {
  const workerPath = path.join(__dirname, 'whisper-cpp-worker.py');
  const python = process.env.PYTHON || 'python';
  const probe = spawnSync(python, [
    '-c',
    [
      'import runpy, sys',
      'module = runpy.run_path(sys.argv[1], run_name="worker_module")',
      'backend, _ = module["_runtime_backend"]("ggml_vulkan: Found 2 Vulkan devices", "cpu", None)',
      'print(backend)'
    ].join('; '),
    workerPath
  ], { encoding: 'utf8', windowsHide: true });
  assert.equal(probe.status, 0, probe.stderr || 'worker runtime probe failed');
  assert.equal(probe.stdout.trim(), 'cpu');
}

function testLatencyMetricsAreDeterministic() {
  resetService();
  speechService._startLatencySession(17, 1000);
  speechService._markLatencyEvent('firstAudioAt', 1250);
  speechService._markLatencyEvent('firstPartialAt', 3500);
  speechService._markLatencyEvent('captureStoppedAt', 6000);
  speechService._markLatencyEvent('finalTranscriptionAt', 7200);
  speechService._markLatencyEvent('dispatchAt', 7300);

  assert.deepEqual(speechService._getLatencyMetrics(), {
    sessionId: 17,
    startedAt: 1000,
    firstAudioMs: 250,
    firstPartialMs: 2500,
    captureToFinalMs: 1200,
    finalTranscriptionMs: 6200,
    dispatchMs: 6300,
    audioChunks: 0,
    audioBytes: 0,
    droppedChunks: 0
  });
}

function testLowLatencyContractsAreWired() {
  const mainSource = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
  const speechSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'speech.service.js'), 'utf8');
  assert(mainSource.includes('prewarmWhisper'), 'speech worker must be prewarmed after startup');
  assert(speechSource.includes("_markLatencyEvent('firstPartialAt'"), 'first partial latency must be marked');
  assert(speechSource.includes("_markLatencyEvent('finalTranscriptionAt'"), 'final latency must be marked');
}

function run() {
  testFastProfileDefaults();
  testWorkerDeclaresSpeedFlags();
  testForcedCpuRuntimeIsReportedAsCpu();
  testDiscreteGpuSelectionWinsOverIntegrated();
  testLatencyMetricsAreDeterministic();
  testLowLatencyContractsAreWired();
  console.log('Speech latency tests: passed');
}

try {
  run();
} catch (error) {
  console.error('Speech latency tests: failed', error);
  process.exitCode = 1;
}
