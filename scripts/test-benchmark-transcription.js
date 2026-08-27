const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const benchmark = require('./benchmark-transcription');

function testPercentiles() {
  const summary = benchmark.summarizeDurations([10, 30, 20, 40, 50]);
  assert.equal(summary.medianMs, 30);
  assert.equal(summary.p95Ms, 50);
}

function testVariantsAreComparable() {
  const labels = benchmark.buildVariantSpecs().map((variant) => variant.label);
  assert.deepEqual(labels, ['original', 'faster', 'slower', 'quieter', 'louder', 'longer-pause']);
}

function testReportDoesNotExposeTranscript() {
  const report = benchmark.sanitizeResult({
    text: 'texto confidencial',
    backend: 'vulkan',
    gpuName: 'AMD Radeon RX 6600',
    transcribeMs: 1234,
  });
  assert.equal(report.text, undefined);
  assert.equal(report.backendUsed, 'vulkan');
  assert.equal(report.transcribeMs, 1234);
}

function testBenchmarkOptionsAcceptBaseline() {
  const options = benchmark.parseArgs(['--runs=5', '--threads=12', '--baseline-ms=10190', '--original-only']);
  assert.equal(options.runs, 5);
  assert.equal(options.threads, 12);
  assert.equal(options.baselineMs, 10190);
  assert.equal(options.originalOnly, true);
}

function testBenchmarkOptionsAcceptSpaceSeparatedValues() {
  const options = benchmark.parseArgs([
    '--backend', 'vulkan',
    '--device', '1',
    '--threads', '12'
  ]);
  assert.equal(options.backend, 'vulkan');
  assert.equal(options.device, '1');
  assert.equal(options.threads, 12);
}

function testAcceptanceDoesNotOverclaimHardwareOrMissingVariants() {
  const originalReport = { summary: { qualityPass: true, allRunsSucceeded: true, rtfMedian: 0.2, wall: { medianMs: 100 } } };
  const noVariants = benchmark.buildAcceptance({
    ready: { backendUsed: 'vulkan', backendConfirmed: true, gpuName: 'AMD Radeon 7900' },
    originalReport,
    variantReports: {},
    baselineMs: null,
    originalOnly: true
  });
  assert.equal(noVariants.vulkanConfirmed, true);
  assert.equal(noVariants.variantsQualityPass, null);

  const cpu = benchmark.buildAcceptance({
    ready: { backendUsed: 'cpu', gpuName: 'AMD Radeon RX 6600' },
    originalReport,
    variantReports: { faster: { summary: { qualityPass: true, allRunsSucceeded: true } } },
    baselineMs: null,
    originalOnly: false
  });
  assert.equal(cpu.vulkanConfirmed, false);
  assert.equal(cpu.variantsQualityPass, true);
}

function testAcceptanceRequiresRuntimeBackendConfirmation() {
  const originalReport = { summary: { qualityPass: true, allRunsSucceeded: true, rtfMedian: 0.2, wall: { medianMs: 100 } } };
  const unconfirmed = benchmark.buildAcceptance({
    ready: { backendUsed: 'vulkan', backendConfirmed: false },
    originalReport,
    variantReports: {},
    baselineMs: null,
    originalOnly: true
  });
  assert.equal(unconfirmed.vulkanConfirmed, false);

  const confirmed = benchmark.buildAcceptance({
    ready: { backendUsed: 'vulkan', backendConfirmed: true },
    originalReport,
    variantReports: {},
    baselineMs: null,
    originalOnly: true
  });
  assert.equal(confirmed.vulkanConfirmed, true);
}

function testBenchmarkUsesPlatformDataDirectory() {
  const home = 'C:\\Users\\runner';
  assert.equal(
    benchmark.appDataRoot('linux', { HOME: home }, home),
    require('path').join(home, '.config')
  );
  assert.equal(
    benchmark.appDataRoot('darwin', { HOME: home }, home),
    require('path').join(home, 'Library', 'Application Support')
  );
  assert.equal(
    benchmark.appDataRoot('win32', { APPDATA: 'C:\\Users\\runner\\AppData\\Roaming' }, home),
    'C:\\Users\\runner\\AppData\\Roaming'
  );
}

function testBenchmarkFindsSingleConfigWhisperBinary() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opencluely-benchmark-'));
  const home = path.join(tempRoot, 'home');
  const binary = path.join(home, '.config', 'opencluely', '.whisper.cpp', 'build', 'bin', 'whisper-cli');
  fs.mkdirSync(path.dirname(binary), { recursive: true });
  fs.writeFileSync(binary, 'test binary');
  try {
    const paths = benchmark.resolveLocalPaths({ platform: 'linux', env: { HOME: home }, homeDir: home });
    assert.equal(paths.bin, binary);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

async function testBenchmarkRejectsIncompleteRuns() {
  let calls = 0;
  const report = await benchmark.measureVariant({
    async transcribe() {
      calls += 1;
      if (calls === 1) {
        return {
          ok: true,
          text: 'falarei trinta segundos transcrição rápida pausada pergunta tom baixo alto',
          transcribeMs: 100
        };
      }
      throw new Error('timeout');
    }
  }, { label: 'original', path: 'fixture.wav', durationMs: 1000 }, 2);

  assert.equal(report.summary.successfulRuns, 1);
  assert.equal(report.summary.failedRuns, 1);
  assert.equal(report.summary.allRunsSucceeded, false);
  assert.equal(report.summary.qualityPass, false);
  const acceptance = benchmark.buildAcceptance({
    ready: { backendUsed: 'cpu', backendConfirmed: true },
    originalReport: report,
    variantReports: {},
    baselineMs: null,
    originalOnly: true
  });
  assert.equal(acceptance.originalQualityPass, false);
}

async function run() {
  testPercentiles();
  testVariantsAreComparable();
  testReportDoesNotExposeTranscript();
  testBenchmarkOptionsAcceptBaseline();
  testBenchmarkOptionsAcceptSpaceSeparatedValues();
  testAcceptanceDoesNotOverclaimHardwareOrMissingVariants();
  testAcceptanceRequiresRuntimeBackendConfirmation();
  testBenchmarkUsesPlatformDataDirectory();
  testBenchmarkFindsSingleConfigWhisperBinary();
  await testBenchmarkRejectsIncompleteRuns();
  console.log('Speech benchmark tests: passed');
}

run().catch((error) => {
  console.error('Speech benchmark tests: failed', error);
  process.exitCode = 1;
});
