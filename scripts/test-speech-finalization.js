const assert = require('assert');
const fs = require('fs');
const { spawnSync } = require('child_process');
const speechService = require('../src/services/speech.service');

function resetService() {
  if (speechService._whisperBatchTimer) {
    clearTimeout(speechService._whisperBatchTimer);
  }
  speechService.recordingSessionId = 1;
  speechService.isRecording = false;
  speechService.isFinalizing = false;
  speechService.runtimeSettings = {};
  speechService._whisperFlushQueue = Promise.resolve();
  speechService._activeWhisperFlushes = new Set();
  speechService._whisperPendingSegments = [];
  speechService._whisperBatchPending = [];
  speechService._whisperBatchTimer = null;
  speechService._whisperBatchFlushScheduled = false;
  speechService._whisperBatchRunning = false;
  speechService.whisperCppLaunch = null;
  speechService._whisperRunningSegment = null;
  speechService.effectiveWhisperEngine = 'openai';
  speechService.provider = 'whisper';
  speechService._whisperSegmentSequence = 0;
  speechService._transcriptionProgress = null;
  speechService._resetTranscriptionProgress();
}

async function testTailBatchLimitAndOrder() {
  resetService();
  const segments = Array.from({ length: 6 }, (_, index) => ({
    audioBuffer: Buffer.alloc(4 * 32000, index + 1),
    sequence: index + 5,
    durationMs: 4000,
    reason: 'periodic'
  }));
  const batches = speechService._createWhisperTailBatches(segments);
  assert.equal(batches.length, 1, 'six 4-second segments should fit one 30-second tail batch');
  assert.equal(batches[0].segments.length, 6);
  assert.equal(batches[0].audioBuffer.length, 6 * 4 * 32000);
  for (let index = 0; index < segments.length; index += 1) {
    assert.equal(batches[0].audioBuffer[index * 4 * 32000], index + 1, 'tail audio order must be preserved');
  }
}

async function testMergedBatchUsesOneTranscriptionCall() {
  resetService();
  speechService.isFinalizing = true;
  speechService._transcriptionProgress.totalSegments = 6;
  const originalTranscribe = speechService._transcribeWhisperBuffer;
  const calls = [];
  speechService._transcribeWhisperBuffer = async (audioBuffer) => {
    calls.push(audioBuffer);
    return 'merged transcript';
  };
  try {
    const segments = Array.from({ length: 6 }, (_, index) => ({
      audioBuffer: Buffer.alloc(16, index + 1),
      sequence: index + 5,
      durationMs: 1,
      reason: 'periodic'
    }));
    await speechService._enqueueWhisperSegment(Buffer.concat(segments.map((segment) => segment.audioBuffer)), {
      sessionId: 1,
      sequence: 5,
      reason: 'final-batch',
      final: true,
      sourceSegments: segments,
      deferFailureOutcome: true
    });
    assert.equal(calls.length, 1, 'a consolidated tail must use one Whisper call');
    assert.equal(calls[0].length, 6 * 16);
    assert.equal(speechService._transcriptionProgress.completedSegments, 6);
  } finally {
    speechService._transcribeWhisperBuffer = originalTranscribe;
  }
}

async function testStopConsolidatesQueuedSegments() {
  resetService();
  speechService.provider = 'whisper';
  speechService.isFinalizing = true;
  speechService.useRendererCapture = false;
  speechService._transcriptionProgress.totalSegments = 7;
  const originalTranscribe = speechService._transcribeWhisperBuffer;
  const calls = [];
  speechService._transcribeWhisperBuffer = async (audioBuffer) => {
    calls.push(audioBuffer.length);
    if (calls.length === 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    return 'ok';
  };
  try {
    for (let sequence = 1; sequence <= 7; sequence += 1) {
      const audioBuffer = Buffer.alloc(16, sequence);
      speechService._enqueueWhisperSegment(audioBuffer, {
        sessionId: 1,
        sequence,
        reason: sequence === 1 ? 'segment' : 'periodic',
        sourceSegments: [{ audioBuffer, sequence }]
      });
    }
    await speechService._finalizeWhisperStop();
    assert.deepEqual(calls, [16, 96], 'the active segment plus one merged six-segment tail are expected');
  } finally {
    speechService._transcribeWhisperBuffer = originalTranscribe;
  }
}

async function testFasterBatchSizesAndOrder() {
  const originalBatchTranscribe = speechService._transcribeWhisperBuffersInBatch;
  try {
    for (const batchSize of [2, 4, 8]) {
      resetService();
      speechService.effectiveWhisperEngine = 'faster';
      speechService.runtimeSettings = {
        whisperBatchSize: batchSize,
        whisperBatchTimeoutMs: 10000,
      };
      speechService._transcriptionProgress.totalSegments = batchSize;
      const observedBatches = [];
      speechService._transcribeWhisperBuffersInBatch = async (trackedBatch) => {
        const sequences = trackedBatch.map((tracked) => tracked.sequence);
        observedBatches.push(sequences);
        assert(sequences.length <= batchSize, 'batch must respect configured size');
        return trackedBatch.map((tracked) => ({
          id: `result-${tracked.sequence}`,
          ok: true,
          text: `text-${tracked.sequence}`,
        }));
      };

      const promises = [];
      for (let sequence = 1; sequence <= batchSize; sequence += 1) {
        const audioBuffer = Buffer.alloc(32, sequence);
        promises.push(speechService._enqueueWhisperSegment(audioBuffer, {
          sessionId: 1,
          sequence,
          reason: 'segment',
          sourceSegments: [{ audioBuffer, sequence }],
        }));
      }
      await Promise.all(promises);
      assert.deepEqual(observedBatches, [Array.from({ length: batchSize }, (_, index) => index + 1)],
        `batch size ${batchSize} must preserve input order`);
    }
  } finally {
    speechService._transcribeWhisperBuffersInBatch = originalBatchTranscribe;
  }
}

async function testFasterBatchTimeoutFlushesPartialBatch() {
  resetService();
  speechService.effectiveWhisperEngine = 'faster';
  speechService.runtimeSettings = {
    whisperBatchSize: 4,
    whisperBatchTimeoutMs: 100,
  };
  const originalBatchTranscribe = speechService._transcribeWhisperBuffersInBatch;
  const batches = [];
  speechService._transcribeWhisperBuffersInBatch = async (trackedBatch) => {
    batches.push(trackedBatch.map((tracked) => tracked.sequence));
    return trackedBatch.map(() => ({ ok: true, text: 'timed transcript' }));
  };
  try {
    const promises = [1, 2].map((sequence) => {
      const audioBuffer = Buffer.alloc(32, sequence);
      return speechService._enqueueWhisperSegment(audioBuffer, {
        sessionId: 1,
        sequence,
        reason: 'segment',
        sourceSegments: [{ audioBuffer, sequence }],
      });
    });
    await new Promise((resolve) => setTimeout(resolve, 250));
    await Promise.all(promises);
    assert.deepEqual(batches, [[1, 2]], 'partial batches must flush after the timeout');
  } finally {
    speechService._transcribeWhisperBuffersInBatch = originalBatchTranscribe;
  }
}

async function testFasterBatchFallsBackPerSegment() {
  resetService();
  speechService.effectiveWhisperEngine = 'faster';
  speechService.runtimeSettings = { whisperBatchSize: 2, whisperBatchTimeoutMs: 10000 };
  const originalBatchTranscribe = speechService._transcribeWhisperBuffersInBatch;
  const originalTranscribe = speechService._transcribeWhisperBuffer;
  let batchCalls = 0;
  const individualCalls = [];
  speechService._transcribeWhisperBuffersInBatch = async () => {
    batchCalls += 1;
    throw new Error('simulated batch failure');
  };
  speechService._transcribeWhisperBuffer = async (audioBuffer) => {
    individualCalls.push(audioBuffer[0]);
    return 'individual transcript';
  };
  try {
    const promises = [1, 2].map((sequence) => {
      const audioBuffer = Buffer.alloc(32, sequence);
      return speechService._enqueueWhisperSegment(audioBuffer, {
        sessionId: 1,
        sequence,
        reason: 'segment',
        sourceSegments: [{ audioBuffer, sequence }],
      });
    });
    await Promise.all(promises);
    assert.equal(batchCalls, 1, 'the batch worker should be attempted once');
    assert.deepEqual(individualCalls, [1, 2], 'failed batches must retry in original order');
  } finally {
    speechService._transcribeWhisperBuffersInBatch = originalBatchTranscribe;
    speechService._transcribeWhisperBuffer = originalTranscribe;
  }
}
async function testCpuDetectionScript() {
  const scriptPath = require.resolve('../scripts/detect-cpu.py');
  const candidates = process.platform === 'win32'
    ? [{ command: process.env.PYTHON || 'python', args: [] }, { command: 'py', args: ['-3'] }]
    : [{ command: process.env.PYTHON || 'python3', args: [] }, { command: 'python', args: [] }];
  let result = null;
  let launchError = null;
  for (const candidate of candidates) {
    const probe = spawnSync(candidate.command, [...candidate.args, scriptPath], {
      encoding: 'utf8',
      timeout: 15000,
      windowsHide: true,
    });
    if (!probe.error) {
      result = probe;
      break;
    }
    launchError = probe.error;
  }
  if (!result && launchError && ['EPERM', 'EACCES'].includes(launchError.code)) {
    console.warn(`CPU detection execution skipped by the restricted test runner (${launchError.code})`);
    return;
  }
  assert(result, 'Python is required to execute detect-cpu.py');
  assert.equal(result.status, 0, result.stderr || 'CPU detection script failed');
  const payload = JSON.parse(result.stdout.trim());
  assert.equal(typeof payload.vendor, 'string');
  assert.equal(typeof payload.cpuName, 'string');
  assert.equal(typeof payload.has_avx2, 'boolean');
  assert.equal(typeof payload.has_avx512, 'boolean');
  assert.equal(typeof payload.blas_available, 'boolean');
  assert.equal(typeof payload.logical_cpus, 'number');
}

async function testWhisperCppWorkerContract() {
  const workerSource = fs.readFileSync(require.resolve('../scripts/whisper-cpp-worker.py'), 'utf8');
  assert(workerSource.includes('whisper-cpp'));
  assert(workerSource.includes('"type": "ready"'));
  assert(workerSource.includes('result["type"] = "result"'));
  assert(workerSource.includes('subprocess.run'));
  assert(workerSource.includes('TemporaryDirectory'));
  assert(workerSource.includes('"-otxt"'));
  assert(workerSource.includes('"-of"'));
  assert(workerSource.includes('"-t"'));
}

async function testWhisperCppLaunchConfiguration() {
  resetService();
  speechService.effectiveWhisperEngine = 'whisper-cpp';
  speechService.runtimeSettings = {
    whisperCppCommand: 'configured-whisper-cli',
    whisperCppPython: 'python',
    whisperCppThreads: 6,
    whisperCppBlas: 'false',
    whisperModel: 'base',
    whisperLanguage: 'pt',
  };
  const originalResolveBinary = speechService._resolveWhisperCppBinary;
  const originalResolvePython = speechService._resolveWhisperCppPython;
  speechService._resolveWhisperCppBinary = () => 'configured-whisper-cli';
  speechService._resolveWhisperCppPython = () => ({ command: 'python', baseArgs: [] });
  try {
    const launch = speechService._resolveWhisperCppLaunch();
    assert(launch, 'whisper.cpp launch should be constructed');
    assert.equal(launch.source, 'whisper-cpp');
    assert(launch.args.includes('--binary') && launch.args.includes('configured-whisper-cli'));
    assert(launch.args.includes('--threads') && launch.args.includes('6'));
    assert(!launch.args.includes('--blas'), 'disabled BLAS must not be passed to the worker');
    assert(speechService._getWhisperWorkerPath('whisper-cpp').endsWith('whisper-cpp-worker.py'));
  } finally {
    speechService._resolveWhisperCppBinary = originalResolveBinary;
    speechService._resolveWhisperCppPython = originalResolvePython;
  }
}

async function testWhisperCppFallbackUsesOpenAiCommand() {
  resetService();
  const originalResolveOpenAi = speechService._resolveWhisperCommand;
  const originalTranscribeWorker = speechService._transcribeWithPersistentWorker;
  const originalTranscribeCli = speechService._transcribeWhisperFileWithCli;
  const openAiCommand = { command: 'openai-python', baseArgs: ['-m', 'whisper'] };
  speechService.available = true;
  speechService.effectiveWhisperEngine = 'whisper-cpp';
  speechService.whisperCppLaunch = { command: 'python', args: [], binary: 'whisper-cli' };
  speechService.whisperCommand = null;
  speechService._resolveWhisperCommand = () => openAiCommand;
  speechService._transcribeWithPersistentWorker = async () => {
    throw new Error('whisper.cpp worker failed');
  };
  speechService._transcribeWhisperFileWithCli = async () => {
    assert.strictEqual(speechService.whisperCommand, openAiCommand);
    return 'fallback transcript';
  };
  try {
    const transcript = await speechService._transcribeWhisperFile('audio.wav');
    assert.equal(transcript, 'fallback transcript');
    assert.equal(speechService._getEffectiveWhisperEngine(), 'openai');
  } finally {
    speechService._resolveWhisperCommand = originalResolveOpenAi;
    speechService._transcribeWithPersistentWorker = originalTranscribeWorker;
    speechService._transcribeWhisperFileWithCli = originalTranscribeCli;
  }
}
async function testHardwareStatusReportsVulkanPath() {
  resetService();
  const originalScriptProbe = speechService._runHardwareScriptJson;
  const originalResolveLaunch = speechService._resolveWhisperCppLaunch;
  speechService.available = true;
  speechService.effectiveWhisperEngine = 'whisper-cpp';
  speechService.whisperCppLaunch = {
    binary: __filename,
    model: __filename,
    backend: 'vulkan'
  };
  speechService._runHardwareScriptJson = (filename) => filename === 'detect-gpu.py'
    ? { device: 'cpu', cuda: false, rocm: false, gpuName: 'AMD Radeon RX 6600', vulkan: true, vulkanGpuName: 'AMD Radeon RX 6600' }
    : { vendor: 'AMD', cpuName: 'AMD Ryzen', has_avx2: true, has_avx512: false, blas_available: true, logical_cpus: 12 };
  speechService._resolveWhisperCppLaunch = () => speechService.whisperCppLaunch;
  try {
    const status = speechService.getHardwareStatus({ probe: false });
    assert.equal(status.execution.kind, 'gpu');
    assert.equal(status.execution.backend, 'vulkan');
    assert.equal(status.gpu.name, 'AMD Radeon RX 6600');
    assert.equal(status.engine.modelExists, true);
    assert.equal(status.engine.requestedBackend, 'vulkan');
  } finally {
    speechService._runHardwareScriptJson = originalScriptProbe;
    speechService._resolveWhisperCppLaunch = originalResolveLaunch;
  }
}

async function testHardwareStatusUiContract() {
  const indexSource = fs.readFileSync(require.resolve('../index.html'), 'utf8');
  const mainWindowSource = fs.readFileSync(require.resolve('../src/ui/main-window.js'), 'utf8');
  const preloadSource = fs.readFileSync(require.resolve('../preload.js'), 'utf8');
  const mainSource = fs.readFileSync(require.resolve('../main.js'), 'utf8');
  assert(indexSource.includes('id="whisperStatusButton"'));
  assert(indexSource.includes('id="whisperStatusPopover"'));
  assert(indexSource.includes('id="whisperStatusTestButton"'));
  assert(mainWindowSource.includes('loadWhisperStatus'));
  assert(mainWindowSource.includes('diagnoseSpeech'));
  assert(preloadSource.includes("ipcRenderer.invoke('get-speech-status')"));
  assert(preloadSource.includes("ipcRenderer.invoke('diagnose-speech'"));
  assert(mainSource.includes('ipcMain.handle("get-speech-status"'));
  assert(mainSource.includes('ipcMain.handle("diagnose-speech"'));
}

async function testVulkanInstallerContract() {
  const installerSource = fs.readFileSync(require.resolve('../src/core/whisper-installer.js'), 'utf8');
  assert(installerSource.includes('GGML_VULKAN='));
  assert(installerSource.includes('--branch', 'v1.9.1'));
  assert(installerSource.includes('v1.9.1'));
  assert(installerSource.includes('Faster Whisper'));
  const gpuSource = fs.readFileSync(require.resolve('../scripts/detect-gpu.py'), 'utf8');
  assert(gpuSource.includes('vulkaninfo'));
  assert(gpuSource.includes('vulkanGpuName'));
}
async function testStateAndLlmGuards() {
  const mainSource = fs.readFileSync(require.resolve('../main.js'), 'utf8');
  const chatSource = fs.readFileSync(require.resolve('../chat.html'), 'utf8');
  const legacyChatSource = fs.readFileSync(require.resolve('../src/ui/chat-window.js'), 'utf8');
  assert(mainSource.includes('if (!this._speechTranscriptionComplete)'), 'LLM completion barrier must exist');
  assert(!mainSource.includes('sessionManager.addUserInput(fragment'), 'live fragments must not enter session memory');
  assert(!chatSource.includes("status.includes('Recording')"), 'chat status must not control recording state');
  assert(!legacyChatSource.includes("status.includes('Recording')"), 'legacy chat status must not control recording state');
}

async function testFasterEngineSettingsPersistence() {
  resetService();
  speechService.updateSettings({
    speechProvider: 'whisper',
    whisperEngine: 'faster',
    whisperFasterDevice: 'cuda',
    whisperFasterComputeType: 'float16',
    whisperBatchSize: 4,
    whisperBatchTimeoutMs: 2000,
    whisperMaxConcurrent: 4,
    whisperBeamSize: 5
  });
  const status = speechService.getStatus();
  assert.equal(status.effectiveSettings.whisperEngine, 'faster');
  assert.equal(status.effectiveSettings.whisperFasterDevice, 'cuda');
  assert.equal(status.effectiveSettings.whisperFasterComputeType, 'float16');
  assert.equal(status.effectiveSettings.whisperBatchSize, 4);
  assert.equal(status.effectiveSettings.whisperBatchTimeoutMs, 2000);
  assert.equal(status.effectiveSettings.whisperMaxConcurrent, 4);
  assert.equal(status.effectiveSettings.whisperBeamSize, 5);

  const mainSource = fs.readFileSync(require.resolve('../main.js'), 'utf8');
  assert(mainSource.includes('envUpdates.WHISPER_ENGINE'), 'engine must be persisted to .env');
  assert(mainSource.includes('envUpdates.WHISPER_FASTER_DEVICE'), 'device must be persisted to .env');
  assert(mainSource.includes('envUpdates.WHISPER_FASTER_COMPUTE_TYPE'), 'compute type must be persisted to .env');
  assert(mainSource.includes('envUpdates.WHISPER_BATCH_SIZE'), 'batch size must be persisted to .env');
  assert(mainSource.includes('envUpdates.WHISPER_BATCH_TIMEOUT_MS'), 'batch timeout must be persisted to .env');
  assert(mainSource.includes('envUpdates.WHISPER_MAX_CONCURRENT'), 'worker concurrency must be persisted to .env');

  const settingsSource = fs.readFileSync(require.resolve('../src/ui/settings-window.js'), 'utf8');
  assert(settingsSource.includes("settings.whisperEngine = whisperEngineSelect.value"));
  assert(settingsSource.includes("settings.whisperFasterDevice = whisperFasterDeviceSelect.value"));
  assert(settingsSource.includes("settings.whisperFasterComputeType = whisperFasterComputeTypeSelect.value"));
}

async function testGPUDetectionScript() {
  const scriptPath = require.resolve('../scripts/detect-gpu.py');
  const candidates = process.platform === 'win32'
    ? [{ command: process.env.PYTHON || 'python', args: [] }, { command: 'py', args: ['-3'] }]
    : [{ command: process.env.PYTHON || 'python3', args: [] }, { command: 'python', args: [] }];
  let result = null;
  let launchError = null;
  for (const candidate of candidates) {
    const probe = spawnSync(candidate.command, [...candidate.args, scriptPath], {
      encoding: 'utf8',
      timeout: 15000,
      windowsHide: true,
    });
    if (!probe.error) {
      result = probe;
      break;
    }
    launchError = probe.error;
  }
  if (!result && launchError && ['EPERM', 'EACCES'].includes(launchError.code)) {
    console.warn(`GPU detection execution skipped by the restricted test runner (${launchError.code})`);
    return;
  }
  assert(result, 'Python is required to execute detect-gpu.py');
  assert.equal(result.status, 0, result.stderr || 'GPU detection script failed');
  const payload = JSON.parse(result.stdout.trim());
  assert(['cuda', 'rocm', 'cpu'].includes(payload.device));
  assert.equal(typeof payload.cuda, 'boolean');
  assert.equal(typeof payload.rocm, 'boolean');
  assert.equal(typeof payload.gpuName, 'string');
}

async function testFasterEngineStatusAndLaunch() {
  resetService();
  speechService.updateSettings({ speechProvider: 'whisper', whisperEngine: 'faster', whisperFasterDevice: 'cpu', whisperFasterComputeType: 'int8' });
  const status = speechService.getStatus();
  assert.equal(status.effectiveSettings.whisperEngine, 'faster');
  assert.equal(status.effectiveSettings.whisperFasterDevice, 'cpu');
  assert.equal(status.effectiveSettings.whisperFasterComputeType, 'int8');
  const launch = speechService._resolveFasterWhisperLaunch();
  if (launch) {
    assert(launch.args.includes('--device') && launch.args.includes('cpu'));
    assert(launch.args.includes('--compute-type') && launch.args.includes('int8'));
  }
  assert(speechService._getWhisperWorkerPath('faster').endsWith('faster-whisper-worker.py'));
  assert(speechService._getWhisperWorkerPath('openai').endsWith('whisper-worker.py'));
}

async function testFasterFallbackUsesOpenAiCommand() {
  resetService();
  const originalResolveOpenAi = speechService._resolveWhisperCommand;
  const originalTranscribeWorker = speechService._transcribeWithPersistentWorker;
  const originalTranscribeCli = speechService._transcribeWhisperFileWithCli;
  const openAiCommand = { command: 'openai-python', baseArgs: ['-m', 'whisper'] };
  speechService.available = true;
  speechService.effectiveWhisperEngine = 'faster';
  speechService.fasterWhisperLaunch = { command: 'faster-python', args: [] };
  speechService.whisperCommand = null;
  speechService._resolveWhisperCommand = () => openAiCommand;
  speechService._transcribeWithPersistentWorker = async () => {
    throw new Error('faster worker failed');
  };
  speechService._transcribeWhisperFileWithCli = async () => {
    assert.strictEqual(speechService.whisperCommand, openAiCommand);
    return 'fallback transcript';
  };
  try {
    const transcript = await speechService._transcribeWhisperFile('audio.wav');
    assert.equal(transcript, 'fallback transcript');
    assert.equal(speechService._getEffectiveWhisperEngine(), 'openai');
  } finally {
    speechService._resolveWhisperCommand = originalResolveOpenAi;
    speechService._transcribeWithPersistentWorker = originalTranscribeWorker;
    speechService._transcribeWhisperFileWithCli = originalTranscribeCli;
  }
}

async function testWorkerContractText() {
  const workerSource = fs.readFileSync(require.resolve('../scripts/faster-whisper-worker.py'), 'utf8');
  assert(workerSource.includes('"type": "ready"'));
  assert(workerSource.includes('result["type"] = "result"'));
  assert(workerSource.includes('"type": "fatal"'));
  assert(workerSource.includes('WhisperModel'));
  assert(workerSource.includes('contextlib.redirect_stdout(sys.stderr)'));
  assert(workerSource.includes('transcribe_batch'));
  assert(workerSource.includes('batch_result'));
  assert(workerSource.includes('ThreadPoolExecutor'));
  assert(workerSource.includes('executor.map'));
  assert(workerSource.includes('--max-concurrent'));
}

async function testFinalizationBlocksNewRecording() {
  resetService();
  speechService.provider = 'whisper';
  speechService.available = true;
  speechService.isFinalizing = true;
  const originalStart = speechService._startWhisperRecording;
  let started = false;
  speechService._startWhisperRecording = () => { started = true; };
  try {
    speechService.startRecording();
    assert.equal(started, false, 'a new recording must be rejected while finalizing');
  } finally {
    speechService._startWhisperRecording = originalStart;
    speechService.isFinalizing = false;
  }
}

async function testEngineSwitchingPreservesFallback() {
  resetService();
  const originalResolveOpenAi = speechService._resolveWhisperCommand;
  const originalResolveFaster = speechService._resolveFasterWhisperLaunch;
  const originalResolveCpp = speechService._resolveWhisperCppLaunch;

  speechService._resolveWhisperCommand = () => ({ command: 'openai-cli', baseArgs: ['-m', 'whisper'] });
  speechService._resolveFasterWhisperLaunch = () => ({ command: 'faster-python', args: ['worker.py'] });
  speechService._resolveWhisperCppLaunch = () => ({ command: 'cpp-python', args: ['worker.py'], binary: 'whisper-cli' });

  try {
    // Switch to faster
    speechService.updateSettings({ whisperEngine: 'faster' });
    assert.equal(speechService._getEffectiveWhisperEngine(), 'faster');
    assert.equal(speechService.available, true);

    // Switch to whisper-cpp
    speechService.updateSettings({ whisperEngine: 'whisper-cpp' });
    assert.equal(speechService._getEffectiveWhisperEngine(), 'whisper-cpp');
    assert.equal(speechService.available, true);

    // Switch to openai
    speechService.updateSettings({ whisperEngine: 'openai' });
    assert.equal(speechService._getEffectiveWhisperEngine(), 'openai');
    assert.equal(speechService.available, true);

    // Verify fallback chain: faster fails → openai
    speechService.updateSettings({ whisperEngine: 'faster' });
    speechService._resolveFasterWhisperLaunch = () => null;
    speechService.initializeClient();
    assert.equal(speechService._getEffectiveWhisperEngine(), 'openai');
    assert.equal(speechService.available, true);
  } finally {
    speechService._resolveWhisperCommand = originalResolveOpenAi;
    speechService._resolveFasterWhisperLaunch = originalResolveFaster;
    speechService._resolveWhisperCppLaunch = originalResolveCpp;
  }
}

async function testUtf8WorkerProtocolContract() {
  const workerPaths = [
    '../scripts/whisper-cpp-worker.py',
    '../scripts/faster-whisper-worker.py',
    '../scripts/whisper-worker.py'
  ];
  for (const workerPath of workerPaths) {
    const source = fs.readFileSync(require.resolve(workerPath), 'utf8');
    assert(source.includes('_configure_utf8_stdio'), `${workerPath} must configure UTF-8 stdio`);
    assert(source.includes("encoding='utf-8'"), `${workerPath} must emit UTF-8`);
    assert(source.includes('ensure_ascii=False'), `${workerPath} must preserve Unicode characters`);
  }
  const serviceSource = fs.readFileSync(require.resolve('../src/services/speech.service'), 'utf8');
  assert(serviceSource.includes("PYTHONIOENCODING: 'utf-8'"), 'persistent worker must receive UTF-8 environment');
  assert(serviceSource.includes("PYTHONUTF8: '1'"), 'persistent worker must enable Python UTF-8 mode');
}

async function testChatPreservesMainOverlayContract() {
  const windowManagerSource = fs.readFileSync(require.resolve('../src/managers/window.manager'), 'utf8');
  assert(windowManagerSource.includes('_ensureMainWindowVisible()'), 'chat opening must preserve the main overlay');
  assert(windowManagerSource.includes('mainWindow.showInactive()'), 'main overlay must be restored without stealing chat focus');
  assert(windowManagerSource.includes("if (windowType === 'chat' && this.windows.has('chat')"), 'only chat toggling may hide the chat window');
  assert(windowManagerSource.includes('this._ensureMainWindowVisible();'), 'chat opening must restore the main overlay');
}
Promise.resolve()
  .then(testTailBatchLimitAndOrder)
  .then(testMergedBatchUsesOneTranscriptionCall)
  .then(testStopConsolidatesQueuedSegments)
  .then(testFasterBatchSizesAndOrder)
  .then(testFasterBatchTimeoutFlushesPartialBatch)
  .then(testFasterBatchFallsBackPerSegment)
  .then(testCpuDetectionScript)
  .then(testWhisperCppWorkerContract)
  .then(testWhisperCppLaunchConfiguration)
  .then(testWhisperCppFallbackUsesOpenAiCommand)
  .then(testStateAndLlmGuards)
  .then(testFasterEngineSettingsPersistence)
  .then(testGPUDetectionScript)
  .then(testHardwareStatusReportsVulkanPath)
  .then(testHardwareStatusUiContract)
  .then(testVulkanInstallerContract)
  .then(testFasterEngineStatusAndLaunch)
  .then(testFasterFallbackUsesOpenAiCommand)
  .then(testWorkerContractText)
  .then(testFinalizationBlocksNewRecording)
  .then(testEngineSwitchingPreservesFallback)
  .then(testUtf8WorkerProtocolContract)
  .then(testChatPreservesMainOverlayContract)
  .then(() => console.log('Speech finalization tests: passed'))
  .catch((error) => {
    console.error('Speech finalization tests: failed', error);
    process.exitCode = 1;
  });
