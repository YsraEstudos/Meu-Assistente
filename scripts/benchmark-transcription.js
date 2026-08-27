const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const WORKER_REQUEST_TIMEOUT_MS = 210000;

const REFERENCE_ALTERNATIVES = [
  ['falarei'],
  ['trinta', '30'],
  ['segundos'],
  ['transcri'],
  ['rápid'],
  ['pausad'],
  ['pergunt'],
  ['tom'],
  ['baixo'],
  ['alto']
];

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function qualityCheck(text) {
  const normalized = normalizeText(text);
  const missingKeywords = REFERENCE_ALTERNATIVES
    .filter((alternatives) => !alternatives.some((term) => normalized.includes(normalizeText(term))))
    .map((alternatives) => alternatives[0]);
  return {
    pass: missingKeywords.length === 0,
    missingKeywords,
    textLength: String(text || '').trim().length
  };
}

function percentile(values, fraction) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1));
  return sorted[index];
}

function summarizeDurations(values) {
  const numbers = values.map(Number).filter((value) => Number.isFinite(value));
  return {
    count: numbers.length,
    medianMs: percentile(numbers, 0.5),
    p95Ms: percentile(numbers, 0.95),
    minMs: numbers.length ? Math.min(...numbers) : null,
    maxMs: numbers.length ? Math.max(...numbers) : null
  };
}

function buildVariantSpecs() {
  return [
    { label: 'original', filter: null },
    { label: 'faster', filter: 'atempo=1.25' },
    { label: 'slower', filter: 'atempo=0.80' },
    { label: 'quieter', filter: 'volume=0.65' },
    { label: 'louder', filter: 'volume=1.35' },
    { label: 'longer-pause', filter: 'apad=pad_dur=0.8' }
  ];
}

function sanitizeResult(result, durationMs = null) {
  const transcribeMs = Number(result && result.transcribeMs) || null;
  return {
    ok: result?.ok === true,
    transcribeMs,
    backendRequested: result?.backendRequested || null,
    backendUsed: result?.backendUsed || result?.backend || null,
    backendConfirmed: result?.backendConfirmed === true,
    device: result?.device || null,
    gpuName: result?.gpuName || null,
    rtf: transcribeMs && durationMs ? Number((transcribeMs / durationMs).toFixed(4)) : null,
    quality: qualityCheck(result?.text || '')
  };
}

function parseArgs(argv = process.argv.slice(2)) {
  const result = {
    audio: null,
    runs: 5,
    backend: process.env.WHISPER_CPP_BACKEND || 'vulkan',
    device: process.env.WHISPER_CPP_DEVICE || '0',
    threads: Number(process.env.WHISPER_CPP_THREADS || os.cpus().length || 4),
    noServer: false,
    originalOnly: false,
    baselineMs: null
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--no-server') {
      result.noServer = true;
    } else if (arg === '--original-only') {
      result.originalOnly = true;
    } else if (arg.startsWith('--baseline-ms=')) {
      result.baselineMs = Number(arg.slice('--baseline-ms='.length));
    } else if (arg === '--baseline-ms') {
      result.baselineMs = Number(argv[++index]);
    } else if (arg.startsWith('--audio=')) {
      result.audio = arg.slice('--audio='.length);
    } else if (arg === '--audio') {
      result.audio = argv[++index];
    } else if (arg.startsWith('--runs=')) {
      result.runs = Number(arg.slice('--runs='.length));
    } else if (arg === '--runs') {
      result.runs = Number(argv[++index]);
    } else if (arg.startsWith('--backend=')) {
      result.backend = arg.slice('--backend='.length);
    } else if (arg === '--backend') {
      result.backend = argv[++index];
    } else if (arg.startsWith('--device=')) {
      result.device = arg.slice('--device='.length);
    } else if (arg === '--device') {
      result.device = argv[++index];
    } else if (arg.startsWith('--threads=')) {
      result.threads = Number(arg.slice('--threads='.length));
    } else if (arg === '--threads') {
      result.threads = Number(argv[++index]);
    }
  }
  result.runs = Number.isFinite(result.runs) ? Math.max(1, Math.min(20, Math.floor(result.runs))) : 5;
  result.threads = Number.isFinite(result.threads) ? Math.max(1, Math.min(32, Math.floor(result.threads))) : 4;
  result.baselineMs = Number.isFinite(result.baselineMs) && result.baselineMs > 0 ? result.baselineMs : null;
  return result;
}

function findAudio(audioArgument) {
  if (audioArgument) return path.resolve(audioArgument);
  const audioDir = path.resolve(__dirname, '..', 'audio');
  const candidates = fs.existsSync(audioDir)
    ? fs.readdirSync(audioDir).filter((name) => /\.(ogg|wav|mp3|m4a)$/i.test(name)).sort()
    : [];
  if (!candidates.length) throw new Error('No audio fixture found in audio/; pass --audio <path>');
  return path.join(audioDir, candidates[0]);
}

function appDataRoot() {
  return process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
}

function resolveLocalPaths() {
  const root = path.join(appDataRoot(), 'opencluely');
  const release = path.join(root, '.whisper.cpp', 'build', 'bin', 'Release');
  const bin = [path.join(release, 'whisper-cli.exe'), path.join(release, 'whisper-cli')]
    .find((candidate) => fs.existsSync(candidate));
  const server = [path.join(release, 'whisper-server.exe'), path.join(release, 'whisper-server')]
    .find((candidate) => fs.existsSync(candidate));
  const model = path.join(root, '.whisper-cpp-models', 'ggml-large-v3-turbo.bin');
  const configuredPython = process.env.WHISPER_CPP_PYTHON || process.env.PYTHON || 'python';
  return {
    bin,
    server,
    model,
    python: configuredPython,
    worker: path.resolve(__dirname, 'whisper-cpp-worker.py')
  };
}

function runSync(command, args) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    throw new Error(`${command} failed: ${result.error?.message || result.stderr || result.stdout || result.status}`);
  }
  return result.stdout || '';
}

function audioDurationMs(audioPath) {
  const output = runSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', audioPath]);
  const seconds = Number.parseFloat(output.trim());
  if (!Number.isFinite(seconds)) throw new Error('Could not read audio duration');
  return Math.round(seconds * 1000);
}

function createVariants(audioPath, tempDir) {
  const variants = [];
  for (const spec of buildVariantSpecs()) {
    const output = path.join(tempDir, `${spec.label}.wav`);
    const args = ['-hide_banner', '-loglevel', 'error', '-y', '-i', audioPath, '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le'];
    if (spec.filter) args.push('-af', spec.filter);
    args.push(output);
    runSync('ffmpeg', args);
    variants.push({ ...spec, path: output, durationMs: audioDurationMs(output) });
  }
  return variants;
}

class WorkerClient {
  constructor(paths, options) {
    const args = [
      paths.worker,
      '--binary', paths.bin,
      '--model', paths.model,
      '--language', 'pt',
      '--threads', String(options.threads),
      '--beam-size', '1',
      '--best-of', '1',
      '--no-fallback',
      '--flash-attn',
      '--backend', options.backend,
      '--device', options.device
    ];
    if (!options.noServer && paths.server) args.push('--server-binary', paths.server);
    this.child = spawn(paths.python, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' }
    });
    this.pending = new Map();
    this.requestTimeoutMs = Number(options.requestTimeoutMs) > 0
      ? Number(options.requestTimeoutMs)
      : WORKER_REQUEST_TIMEOUT_MS;
    this.sequence = 0;
    this.stdoutBuffer = '';
    this.stderr = '';
    this.ready = new Promise((resolve, reject) => {
      this.resolveReady = resolve;
      this.rejectReady = reject;
    });
    this.child.stdout.setEncoding('utf8');
    this.child.stderr.setEncoding('utf8');
    this.child.stdout.on('data', (chunk) => this.consume(chunk));
    this.child.stderr.on('data', (chunk) => { this.stderr = (this.stderr + chunk).slice(-2000); });
    this.child.stdin.on('error', (error) => this.fail(error));
    this.child.once('error', (error) => this.fail(error));
    this.child.once('close', (code) => this.fail(new Error(`worker exited with code ${code}`)));
  }

  consume(chunk) {
    this.stdoutBuffer += chunk;
    let newline;
    while ((newline = this.stdoutBuffer.indexOf('\n')) >= 0) {
      const line = this.stdoutBuffer.slice(0, newline).trim();
      this.stdoutBuffer = this.stdoutBuffer.slice(newline + 1);
      if (!line) continue;
      let message;
      try { message = JSON.parse(line); } catch (_) { continue; }
      if (message.type === 'ready') {
        this.resolveReady(message);
        continue;
      }
      const pending = this.pending.get(message.id);
      if (!pending) continue;
      if (message.ok) this.settle(message.id, null, message);
      else this.settle(message.id, new Error(message.error || 'worker transcription failed'));
    }
  }

  settle(id, error, result) {
    const pending = this.pending.get(id);
    if (!pending) return;
    this.pending.delete(id);
    clearTimeout(pending.timer);
    if (error) pending.reject(error);
    else pending.resolve(result);
  }

  fail(error) {
    if (this.resolveReady) {
      this.rejectReady(error);
      this.resolveReady = null;
    }
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      this.pending.delete(id);
      pending.reject(error);
    }
  }

  transcribe(audioPath) {
    const id = String(++this.sequence);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.settle(id, new Error(`worker transcription timed out after ${this.requestTimeoutMs}ms`));
      }, this.requestTimeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      if (!this.child || !this.child.stdin || this.child.stdin.destroyed) {
        this.settle(id, new Error('worker stdin is not writable'));
        return;
      }
      try {
        this.child.stdin.write(JSON.stringify({ type: 'transcribe', id, audioPath }) + '\n', (error) => {
          if (error) this.settle(id, error);
        });
      } catch (error) {
        this.settle(id, error);
      }
    });
  }

  async close() {
    if (!this.child || this.child.killed) return;
    try { this.child.stdin.write(JSON.stringify({ type: 'stop' }) + '\n'); } catch (_) { /* process already closed */ }
    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.child.kill();
        resolve();
      }, 5000);
      this.child.once('close', () => { clearTimeout(timer); resolve(); });
    });
  }
}

function buildAcceptance({ ready, originalReport, variantReports, baselineMs, originalOnly }) {
  const originalMedianMs = originalReport.summary.wall.medianMs;
  return {
    vulkanConfirmed: (ready.backendUsed || '') === 'vulkan' && ready.backendConfirmed === true,
    originalQualityPass: originalReport.summary.qualityPass,
    variantsQualityPass: originalOnly || Object.keys(variantReports).length === 0
      ? null
      : Object.values(variantReports).every((variant) => variant.summary.qualityPass),
    rtfMedianBelow035: originalReport.summary.rtfMedian !== null && originalReport.summary.rtfMedian < 0.35,
    noDroppedChunks: null,
    droppedChunksMeasured: false,
    improvementDeclarationRequiresBaseline: true,
    baselineMedianMs: baselineMs,
    improvementPercent: baselineMs && originalMedianMs
      ? Number(((1 - originalMedianMs / baselineMs) * 100).toFixed(2))
      : null,
    speedImprovementAtLeast10Percent: baselineMs && originalMedianMs
      ? originalMedianMs <= baselineMs * 0.9
      : null
  };
}

async function measureVariant(client, variant, runs) {
  const measurements = [];
  for (let index = 0; index < runs; index += 1) {
    const started = Date.now();
    try {
      const result = await client.transcribe(variant.path);
      measurements.push({
        run: index + 1,
        wallMs: Date.now() - started,
        ...sanitizeResult(result, variant.durationMs)
      });
    } catch (error) {
      measurements.push({ run: index + 1, wallMs: Date.now() - started, ok: false, error: error.message });
    }
  }
  const successful = measurements.filter((measurement) => measurement.ok);
  const wallSummary = summarizeDurations(successful.map((measurement) => measurement.wallMs));
  const transcriptionSummary = summarizeDurations(successful.map((measurement) => measurement.transcribeMs));
  return {
    label: variant.label,
    durationMs: variant.durationMs,
    measurements,
    summary: {
      wall: wallSummary,
      transcribe: transcriptionSummary,
      rtfMedian: percentile(successful.map((measurement) => measurement.rtf).filter((value) => value !== null), 0.5),
      backendUsed: successful[0]?.backendUsed || null,
      gpuName: successful[0]?.gpuName || null,
      qualityPass: successful.length > 0 && successful.every((measurement) => measurement.quality?.pass === true)
    }
  };
}

async function main() {
  const options = parseArgs();
  const audio = findAudio(options.audio);
  if (!fs.existsSync(audio)) throw new Error(`Audio file not found: ${audio}`);
  const paths = resolveLocalPaths();
  for (const [label, value] of Object.entries({ binary: paths.bin, model: paths.model, worker: paths.worker })) {
    if (!value || !fs.existsSync(value)) throw new Error(`Missing ${label} required by the local Whisper worker`);
  }
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opencluely-speech-bench-'));
  const startedAt = Date.now();
  let client;
  try {
    const variants = createVariants(audio, tempDir);
    client = new WorkerClient(paths, options);
    const ready = await client.ready;
    const original = variants[0];
    const warmupStarted = Date.now();
    const warmupResult = await client.transcribe(original.path);
    const warmup = {
      wallMs: Date.now() - warmupStarted,
      ...sanitizeResult(warmupResult, original.durationMs)
    };
    const originalReport = await measureVariant(client, original, options.runs);
    const variantReports = {};
    if (!options.originalOnly) {
      for (const variant of variants.slice(1)) {
        variantReports[variant.label] = await measureVariant(client, variant, 1);
      }
    }
    const report = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      elapsedMs: Date.now() - startedAt,
      audio: { durationMs: audioDurationMs(audio), format: path.extname(audio).slice(1).toLowerCase() },
      configuration: {
        engine: 'whisper-cpp',
        executionMode: ready.executionMode || 'cli',
        backendRequested: ready.backendRequested || options.backend,
        backendUsed: ready.backendUsed || null,
        backendConfirmed: ready.backendConfirmed === true,
        device: ready.device || options.device,
        gpuName: ready.gpuName || null,
        modelLoadMs: Number(ready.modelLoadMs) || null,
        threads: options.threads,
        beamSize: 1,
        bestOf: 1,
        noFallback: true,
        flashAttention: true
      },
      warmup,
      original: originalReport,
      variants: variantReports,
      acceptance: buildAcceptance({
        ready,
        originalReport,
        variantReports,
        baselineMs: options.baselineMs,
        originalOnly: options.originalOnly
      })
    };
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  } finally {
    if (client) await client.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

module.exports = {
  buildVariantSpecs,
  qualityCheck,
  sanitizeResult,
  summarizeDurations,
  parseArgs,
  buildAcceptance,
  WorkerClient
};

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`Speech benchmark failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
