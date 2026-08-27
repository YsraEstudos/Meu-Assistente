const assert = require('assert');
const fs = require('fs');
const os = require('os');
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
  speechService._hardwareStatusPromise = null;
}

function withClearedEnv(keys, callback) {
  const previous = new Map(keys.map((key) => [key, process.env[key]]));
  try {
    keys.forEach((key) => delete process.env[key]);
    return callback();
  } finally {
    keys.forEach((key) => {
      if (previous.get(key) === undefined) delete process.env[key];
      else process.env[key] = previous.get(key);
    });
  }
}

function findPython() {
  const candidates = process.platform === 'win32'
    ? [
      [process.env.PYTHON, []],
      ['python3', []],
      ['python', []],
      ['py', ['-3']]
    ]
    : [
      [process.env.PYTHON, []],
      ['python3', []],
      ['python', []]
    ];
  for (const [command, baseArgs] of candidates) {
    if (!command) continue;
    const result = spawnSync(command, [...baseArgs, '-c', 'import sys; print(sys.version_info[0])'], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 5000
    });
    if (!result.error && result.status === 0) return { command, baseArgs };
  }
  return null;
}

function testFastProfileDefaults() {
  withClearedEnv([
    'WHISPER_LANGUAGE',
    'WHISPER_PERIODIC_FLUSH_MS',
    'WHISPER_SILENCE_HANGOVER_MS',
    'WHISPER_CAPTURE_CHUNK_SAMPLES',
    'WHISPER_CPP_BEAM_SIZE',
    'WHISPER_CPP_BEST_OF',
    'WHISPER_CPP_NO_FALLBACK',
    'WHISPER_CPP_FLASH_ATTENTION'
  ], () => {
    resetService();
    assert.equal(speechService._getWhisperLanguage(), 'pt');
    assert.equal(speechService._getPeriodicFlushMs(), 3000);
    assert.equal(speechService._getSilenceHangoverMs(), 600);
    assert.equal(speechService._getAudioChunkSamples(), 2048);
    assert.equal(speechService._getWhisperCppBeamSize(), 1);
    assert.equal(speechService._getWhisperCppBestOf(), 1);
    assert.equal(speechService._getWhisperCppNoFallback(), true);
    assert.equal(speechService._getWhisperCppFlashAttention(), true);
  });
}

function testAbsoluteWhisperOverridesRemainUsable() {
  resetService();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opencluely-whisper-paths-'));
  const modelPath = path.join(tempDir, 'custom-model.bin');
  const pythonPath = path.join(tempDir, process.platform === 'win32' ? 'python.exe' : 'python');
  const binaryPath = path.join(tempDir, process.platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli');
  fs.writeFileSync(modelPath, 'model');
  fs.writeFileSync(pythonPath, 'python');
  fs.writeFileSync(binaryPath, 'binary');
  try {
    speechService.runtimeSettings = {
      whisperCppModel: modelPath,
      whisperCppPython: pythonPath,
      whisperCppCommand: binaryPath
    };
    assert.equal(speechService._getWhisperCppModelPath(), path.resolve(modelPath));
    assert.equal(speechService._validateWhisperCommand(pythonPath), true);
    assert.equal(speechService._validateWhisperCommand(binaryPath), true);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

async function testAsyncHardwareValidationDoesNotUseSyncValidation() {
  resetService();
  const originalValidate = speechService._validateWhisperCommand;
  const originalValidateAsync = speechService._validateWhisperCommandAsync;
  const originalPath = speechService._getHardwareScriptPath;
  const originalExec = speechService._execFileAsync;
  try {
    speechService._getHardwareScriptPath = () => path.join(__dirname, 'missing-detect-gpu.py');
    speechService._validateWhisperCommand = () => {
      throw new Error('sync command validation must not run from async hardware probes');
    };
    speechService._validateWhisperCommandAsync = async () => true;
    speechService._execFileAsync = async () => ({ stdout: '{"gpuName":"test"}' });
    const result = await speechService._runHardwareScriptJsonAsync('detect-gpu.py');
    assert.deepEqual(result, { gpuName: 'test' });
  } finally {
    speechService._validateWhisperCommand = originalValidate;
    speechService._validateWhisperCommandAsync = originalValidateAsync;
    speechService._getHardwareScriptPath = originalPath;
    speechService._execFileAsync = originalExec;
  }
}

async function testFinalLatencyWaitsForFinalization() {
  resetService();
  speechService.recordingSessionId = 1;
  speechService._startLatencySession(1, 1000);
  speechService.isFinalizing = true;
  await speechService._runWhisperTracked({
    sessionId: 1,
    sequence: 1,
    durationMs: 100,
    reason: 'periodic',
    final: false,
    sourceSegmentCount: 1,
    sourceSegments: [],
    deferFailureOutcome: false,
    tailBatchIndex: 0,
    tailBatchTotal: 0,
    cancelled: false
  }, async () => 'ordinary in-flight segment');
  assert.equal(speechService._getLatencyMetrics().finalTranscriptionMs, null);
  assert(Number.isFinite(speechService._getLatencyMetrics().firstPartialMs));
}

async function testAsyncRuntimeProbePreservesConfiguredDevice() {
  resetService();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opencluely-whisper-probe-'));
  const binaryPath = path.join(tempDir, process.platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli');
  const modelPath = path.join(tempDir, 'model.bin');
  fs.writeFileSync(binaryPath, 'binary');
  fs.writeFileSync(modelPath, 'model');
  const originalExec = speechService._execFileAsync;
  let observedArgs = null;
  try {
    speechService._execFileAsync = async (command, args) => {
      assert.equal(command, binaryPath);
      observedArgs = args;
      return { stdout: 'ggml_vulkan: 2 = AMD Radeon RX 6600', stderr: '' };
    };
    const result = await speechService._probeWhisperCppRuntimeAsync({
      binary: binaryPath,
      model: modelPath,
      backend: 'vulkan',
      device: '2'
    });
    assert.equal(result.success, true);
    assert.equal(result.backend, 'vulkan');
    assert.equal(result.device, '2');
    assert.deepEqual(observedArgs.slice(-2), ['-dev', '2']);
  } finally {
    speechService._execFileAsync = originalExec;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

async function testAsyncHardwareStatusResolvesColdLaunch() {
  resetService();
  speechService.provider = 'whisper';
  speechService.effectiveWhisperEngine = 'whisper-cpp';
  speechService.available = false;
  const launch = { binary: __filename, model: __filename, backend: 'cpu', device: 'auto' };
  const originalScripts = speechService._runHardwareScriptJsonAsync;
  const originalResolve = speechService._resolveWhisperCppLaunchAsync;
  try {
    speechService._runHardwareScriptJsonAsync = async (filename) => filename === 'detect-gpu.py'
      ? { gpuName: '', vulkan: false }
      : { cpuName: 'test', logical_cpus: 1 };
    speechService._resolveWhisperCppLaunchAsync = async () => launch;
    const status = await speechService.getHardwareStatusAsync();
    assert.equal(status.engine.binary, __filename);
    assert.equal(status.engine.modelExists, true);
  } finally {
    speechService._runHardwareScriptJsonAsync = originalScripts;
    speechService._resolveWhisperCppLaunchAsync = originalResolve;
  }
}

async function testFailedFinalizationDoesNotClaimFinalLatency() {
  resetService();
  speechService.recordingSessionId = 1;
  speechService.isRecording = false;
  speechService.isFinalizing = true;
  speechService._startLatencySession(1, 1000);
  const originalTakePending = speechService._takePendingWhisperSegments;
  const originalTakeCurrent = speechService._takeCurrentWhisperSegment;
  const originalWaitRenderer = speechService._waitForRendererCaptureDrain;
  const originalWaitFlushes = speechService._waitForWhisperFlushes;
  const originalEnqueue = speechService._enqueueWhisperSegment;
  let stoppedPayload = null;
  const segment = { audioBuffer: Buffer.alloc(32), sequence: 1 };
  speechService._takePendingWhisperSegments = () => [segment];
  speechService._takeCurrentWhisperSegment = () => null;
  speechService._waitForRendererCaptureDrain = async () => {};
  speechService._waitForWhisperFlushes = async () => {};
  speechService._enqueueWhisperSegment = async () => { throw new Error('simulated final failure'); };
  speechService.once('recording-stopped', (payload) => { stoppedPayload = payload; });
  const onError = () => {};
  speechService.on('error', onError);
  try {
    await speechService._finalizeWhisperStop();
    assert(stoppedPayload, 'finalization must still emit a stop payload');
    assert.equal(stoppedPayload.latency.finalTranscriptionMs, null);
  } finally {
    speechService.off('error', onError);
    speechService._takePendingWhisperSegments = originalTakePending;
    speechService._takeCurrentWhisperSegment = originalTakeCurrent;
    speechService._waitForRendererCaptureDrain = originalWaitRenderer;
    speechService._waitForWhisperFlushes = originalWaitFlushes;
    speechService._enqueueWhisperSegment = originalEnqueue;
  }
}

function testCleanupDoesNotLeaveLiveLatencySession() {
  resetService();
  speechService._startLatencySession(3, 1000);
  speechService._markLatencyEvent('firstAudioAt', 1100);
  speechService._cleanup();
  assert.equal(speechService._latencySession, null);
  assert.equal(speechService.getLatencyMetrics(), null);
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
  const python = findPython();
  if (!python) {
    console.warn('Discrete GPU selection probe skipped: no Python interpreter found');
    return;
  }
  const probe = spawnSync(python.command, [...python.baseArgs,
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
  const python = findPython();
  if (!python) {
    console.warn('Forced CPU runtime probe skipped: no Python interpreter found');
    return;
  }
  const probe = spawnSync(python.command, [...python.baseArgs,
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
  const rendererSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui', 'main-window.js'), 'utf8');
  const speechSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'speech.service.js'), 'utf8');
  assert(mainSource.includes('prewarmWhisper'), 'speech worker must be prewarmed after startup');
  assert(speechSource.includes("_markLatencyEvent('firstPartialAt'"), 'first partial latency must be marked');
  assert(speechSource.includes("_markLatencyEvent('finalTranscriptionAt'"), 'final latency must be marked');
  assert(speechSource.includes('_validateWhisperCommandAsync'), 'async hardware probes must validate commands asynchronously');
  assert(mainSource.includes("markLatencyEvent('dispatchAt'"), 'LLM dispatch must mark dispatch latency');
  assert(mainSource.includes('whisperCaptureChunkSamples'), 'settings must expose the capture chunk size');
  assert(rendererSource.includes('settings?.whisperCaptureChunkSamples'), 'renderer must read the configured capture chunk size');
}

async function run() {
  testFastProfileDefaults();
  testAbsoluteWhisperOverridesRemainUsable();
  testWorkerDeclaresSpeedFlags();
  testForcedCpuRuntimeIsReportedAsCpu();
  testDiscreteGpuSelectionWinsOverIntegrated();
  testLatencyMetricsAreDeterministic();
  testLowLatencyContractsAreWired();
  await testAsyncHardwareValidationDoesNotUseSyncValidation();
  await testFinalLatencyWaitsForFinalization();
  await testAsyncRuntimeProbePreservesConfiguredDevice();
  await testAsyncHardwareStatusResolvesColdLaunch();
  await testFailedFinalizationDoesNotClaimFinalLatency();
  testCleanupDoesNotLeaveLiveLatencySession();
  console.log('Speech latency tests: passed');
}

run().catch((error) => {
  console.error('Speech latency tests: failed', error);
  process.exitCode = 1;
});
