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

function testCaptureChunkSizeUsesSupportedWebAudioValue() {
  resetService();
  speechService.runtimeSettings = { whisperCaptureChunkSamples: 3000 };
  assert.equal(speechService._getAudioChunkSamples(), 2048);
}

function testRendererCaptureRechecksGenerationAfterSettings() {
  const rendererSource = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'ui', 'main-window.js'),
    'utf8'
  );
  const captureStart = rendererSource.indexOf('_startRendererAudioCapture() {');
  const settingsAwait = rendererSource.indexOf('await window.electronAPI.getSettings()', captureStart);
  const scriptProcessor = rendererSource.indexOf('audioContext.createScriptProcessor', settingsAwait);
  const workletStart = rendererSource.indexOf('this._tryStartAudioWorkletCapture(', settingsAwait);
  const generationGuard = rendererSource.indexOf(
    'if (!this.isRecording || generation !== this._captureGeneration)',
    settingsAwait
  );
  assert(settingsAwait >= 0, 'renderer capture must load settings asynchronously');
  assert(captureStart >= 0, 'renderer capture start method must exist');
  assert(workletStart > settingsAwait && workletStart < scriptProcessor,
    'AudioWorklet capture must start after loading the configured chunk size');
  assert.match(rendererSource.slice(workletStart, scriptProcessor), /generation,\s*bufferSize\s*\n\s*\);/,
    'renderer must pass the configured chunk size into AudioWorklet startup');
  assert(generationGuard > settingsAwait && generationGuard < scriptProcessor,
    'renderer capture must discard stale settings continuations before creating a script node');
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

async function testVersionedExternalPythonTargetsAreAllowed() {
  resetService();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opencluely-whisper-python-'));
  const pythonPath = path.join(tempDir, process.platform === 'win32' ? 'python3.11.exe' : 'python3.11');
  fs.writeFileSync(pythonPath, 'python');
  try {
    assert.equal(await speechService._validateWhisperCommandAsync(pythonPath), true);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

async function testWindowsPyLauncherIsAllowed() {
  resetService();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opencluely-whisper-py-'));
  const pythonPath = path.join(tempDir, 'py.exe');
  fs.writeFileSync(pythonPath, 'python launcher');
  try {
    assert.equal(speechService._validateWhisperCommand(pythonPath), true);
    assert.equal(await speechService._validateWhisperCommandAsync(pythonPath), true);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function testWorkerDoesNotReportRequestedVulkanAsObservedWithoutDiagnostics() {
  const workerPath = path.join(__dirname, 'whisper-cpp-worker.py');
  const python = findPython();
  if (!python) {
    console.warn('Server backend confirmation probe skipped: no Python interpreter found');
    return;
  }
  const probe = spawnSync(python.command, [...python.baseArgs,
    '-c',
    [
      'import contextlib, json, runpy, sys, types',
      'worker_path = sys.argv[1]',
      'module = runpy.run_path(worker_path, run_name="worker_module")',
      'module["socket"].socket = lambda *args, **kwargs: types.SimpleNamespace(bind=lambda address: None, getsockname=lambda: ("127.0.0.1", 54321), close=lambda: None)',
      'module["socket"].create_connection = lambda *args, **kwargs: contextlib.nullcontext()',
      'module["subprocess"].Popen = lambda *args, **kwargs: types.SimpleNamespace(stdout=[], stderr=[], poll=lambda: None, terminate=lambda: None, wait=lambda **kwargs: None, kill=lambda: None)',
      'args = types.SimpleNamespace(server_binary=worker_path, model=worker_path, backend="vulkan", device="0", language="en", threads=1, beam_size=1, best_of=1, no_fallback=True, flash_attn=True, timeout_seconds=1)',
      'runtime = module["_start_server"](args)',
      'print(json.dumps({"backend": runtime.get("backend"), "backendConfirmed": runtime.get("backendConfirmed")}))'
    ].join('; '),
    workerPath
  ], { encoding: 'utf8', windowsHide: true });
  assert.equal(probe.status, 0, probe.stderr || 'server backend confirmation probe failed');
  assert.deepEqual(JSON.parse(probe.stdout.trim()), { backend: 'cpu', backendConfirmed: false });
}

function testWorkerServerStartupHasSingleOverallDeadline() {
  const workerPath = path.join(__dirname, 'whisper-cpp-worker.py');
  const python = findPython();
  if (!python) {
    console.warn('Server startup deadline probe skipped: no Python interpreter found');
    return;
  }
  const probe = spawnSync(python.command, [...python.baseArgs,
    '-c',
    [
      'import json, runpy, sys, types',
      'worker_path = sys.argv[1]',
      'module = runpy.run_path(worker_path, run_name="worker_module")',
      'clock = [0]',
      'module["time"].monotonic = lambda: (clock.__setitem__(0, clock[0] + 100) or clock[0])',
      'module["time"].sleep = lambda _seconds: None',
      'module["_executable_available"] = lambda _binary: True',
      'module["socket"].socket = lambda *args, **kwargs: types.SimpleNamespace(bind=lambda _address: None, getsockname=lambda: ("127.0.0.1", 54321), close=lambda: None)',
      'module["socket"].create_connection = lambda *args, **kwargs: (_ for _ in ()).throw(OSError("not ready"))',
      'proc = lambda: types.SimpleNamespace(stdout=[], stderr=[], poll=lambda: None, terminate=lambda: None, wait=lambda **kwargs: None, kill=lambda: None)',
      'popen_count = [0]',
      'module["subprocess"].Popen = lambda *args, **kwargs: (popen_count.__setitem__(0, popen_count[0] + 1) or proc())',
      'args = types.SimpleNamespace(server_binary=worker_path, model=worker_path, backend="cpu", device="auto", language="en", threads=1, beam_size=1, best_of=1, no_fallback=True, flash_attn=True, timeout_seconds=180)',
      'runtime = module["_start_server"](args)',
      'print(json.dumps({"mode": runtime.get("mode"), "popenCount": popen_count[0]}))'
    ].join('; '),
    workerPath
  ], { encoding: 'utf8', windowsHide: true });
  assert.equal(probe.status, 0, probe.stderr || 'server startup deadline probe failed');
  assert.deepEqual(JSON.parse(probe.stdout.trim()), { mode: 'cli', popenCount: 1 });
}

async function testWorkerResultPreservesBackendConfirmation() {
  resetService();
  const worker = {};
  speechService._whisperWorker = worker;
  speechService._whisperWorkerRequests = new Map();
  const resultPromise = new Promise((resolve, reject) => {
    speechService._whisperWorkerRequests.set('result-1', {
      worker,
      resolve,
      reject,
      timer: null
    });
  });
  speechService._handleWhisperWorkerMessage(worker, {
    type: 'result',
    id: 'result-1',
    ok: true,
    text: 'ok',
    backendRequested: 'vulkan',
    backendUsed: 'cpu',
    backendConfirmed: false,
    executionMode: 'server',
    device: '0',
    gpuName: ''
  });
  const result = await resultPromise;
  assert.equal(result.backendConfirmed, false);
  assert.equal(speechService._lastWhisperRuntime.backendConfirmed, false);
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

function testStopEventIncludesDispatchLatency() {
  resetService();
  speechService.recordingSessionId = 1;
  speechService._startLatencySession(1, 1000);
  speechService._markLatencyEvent('finalTranscriptionAt', 1500);
  let stoppedPayload = null;
  speechService.once('recording-stopped', (payload) => {
    speechService.markLatencyEvent('dispatchAt', 2000);
    stoppedPayload = payload;
  });

  speechService._finalizeStop('Recording stopped');

  assert(stoppedPayload, 'stop event must include a latency payload');
  assert.equal(stoppedPayload.latency.dispatchMs, 1000);
}

function testExternalWhisperServerOverridesRemainUsable() {
  resetService();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opencluely-whisper-server-'));
  const suffix = process.platform === 'win32' ? '.exe' : '';
  const serverPath = path.join(tempDir, `whisper-server${suffix}`);
  const binaryPath = path.join(tempDir, `whisper-cli${suffix}`);
  fs.writeFileSync(serverPath, 'server');
  fs.writeFileSync(binaryPath, 'binary');
  try {
    speechService.runtimeSettings = { whisperCppServerCommand: serverPath };
    assert.equal(speechService._resolveWhisperCppServerBinary(binaryPath), serverPath);

    speechService.runtimeSettings = {};
    assert.equal(speechService._resolveWhisperCppServerBinary(binaryPath), serverPath);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

async function testAsyncLaunchIncludesExternalWhisperServer() {
  resetService();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opencluely-whisper-async-server-'));
  const suffix = process.platform === 'win32' ? '.exe' : '';
  const serverPath = path.join(tempDir, `whisper-server${suffix}`);
  const binaryPath = path.join(tempDir, `whisper-cli${suffix}`);
  const modelPath = path.join(tempDir, 'model.bin');
  fs.writeFileSync(serverPath, 'server');
  fs.writeFileSync(binaryPath, 'binary');
  fs.writeFileSync(modelPath, 'model');
  const originalWorkerPath = speechService._getWhisperWorkerPath;
  const originalPython = speechService._resolveWhisperCppPythonAsync;
  const originalBinary = speechService._resolveWhisperCppBinaryAsync;
  const originalServer = speechService._resolveWhisperCppServerBinaryAsync;
  try {
    speechService.runtimeSettings = { whisperCppModel: modelPath };
    speechService._getWhisperWorkerPath = () => path.join(__dirname, 'whisper-cpp-worker.py');
    speechService._resolveWhisperCppPythonAsync = async () => ({ command: 'python', baseArgs: [] });
    speechService._resolveWhisperCppBinaryAsync = async () => binaryPath;
    speechService._resolveWhisperCppServerBinaryAsync = async () => serverPath;
    const launch = await speechService._resolveWhisperCppLaunchAsync();
    assert.equal(launch.serverBinary, serverPath);
  } finally {
    speechService._getWhisperWorkerPath = originalWorkerPath;
    speechService._resolveWhisperCppPythonAsync = originalPython;
    speechService._resolveWhisperCppBinaryAsync = originalBinary;
    speechService._resolveWhisperCppServerBinaryAsync = originalServer;
    fs.rmSync(tempDir, { recursive: true, force: true });
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
  assert(rendererSource.includes('Math.log2'), 'renderer must quantize capture chunks to a supported Web Audio size');
}

function testMainUsesLiveLatencyAfterDispatchMark() {
  const mainSource = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
  const handlerStart = mainSource.indexOf('speechService.on("recording-stopped"');
  const liveLatencyDeclaration = mainSource.indexOf('const liveLatency', handlerStart);
  const markMatch = mainSource.slice(handlerStart).match(/speechService\.markLatencyEvent\((['"])dispatchAt\1\)/);
  const mark = markMatch ? handlerStart + markMatch.index : -1;
  const latency = mainSource.indexOf('const latency', mark);
  assert(handlerStart >= 0 && liveLatencyDeclaration > handlerStart && mark > liveLatencyDeclaration && latency > mark,
    'recording-stopped handler must mark dispatch before reading latency');
  const dispatchSection = mainSource.slice(liveLatencyDeclaration, latency + 260);
  assert.match(dispatchSection, /const liveLatency\s*=\s*typeof speechService\.markLatencyEvent[\s\S]*?speechService\.markLatencyEvent\((['"])dispatchAt\1\)/,
    'recording-stopped handler must retain the live latency returned after dispatch marking');
  assert.doesNotMatch(dispatchSection, /const latency\s*=\s*payload\.latency\s*\|\|/,
    'recording-stopped handler must not prefer the pre-dispatch latency snapshot');
}

async function run() {
  testFastProfileDefaults();
  testAbsoluteWhisperOverridesRemainUsable();
  testWorkerDeclaresSpeedFlags();
  testForcedCpuRuntimeIsReportedAsCpu();
  testDiscreteGpuSelectionWinsOverIntegrated();
  testCaptureChunkSizeUsesSupportedWebAudioValue();
  testRendererCaptureRechecksGenerationAfterSettings();
  testLatencyMetricsAreDeterministic();
  testLowLatencyContractsAreWired();
  testMainUsesLiveLatencyAfterDispatchMark();
  await testAsyncHardwareValidationDoesNotUseSyncValidation();
  await testVersionedExternalPythonTargetsAreAllowed();
  await testWindowsPyLauncherIsAllowed();
  testWorkerDoesNotReportRequestedVulkanAsObservedWithoutDiagnostics();
  testWorkerServerStartupHasSingleOverallDeadline();
  await testWorkerResultPreservesBackendConfirmation();
  await testFinalLatencyWaitsForFinalization();
  await testAsyncRuntimeProbePreservesConfiguredDevice();
  await testAsyncHardwareStatusResolvesColdLaunch();
  await testFailedFinalizationDoesNotClaimFinalLatency();
  testStopEventIncludesDispatchLatency();
  testExternalWhisperServerOverridesRemainUsable();
  await testAsyncLaunchIncludesExternalWhisperServer();
  testCleanupDoesNotLeaveLiveLatencySession();
  console.log('Speech latency tests: passed');
}

run().catch((error) => {
  console.error('Speech latency tests: failed', error);
  process.exitCode = 1;
});
