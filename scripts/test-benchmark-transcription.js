const assert = require('assert');
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
  const originalReport = { summary: { qualityPass: true, rtfMedian: 0.2, wall: { medianMs: 100 } } };
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
    variantReports: { faster: { summary: { qualityPass: true } } },
    baselineMs: null,
    originalOnly: false
  });
  assert.equal(cpu.vulkanConfirmed, false);
  assert.equal(cpu.variantsQualityPass, true);
}

function testAcceptanceRequiresRuntimeBackendConfirmation() {
  const originalReport = { summary: { qualityPass: true, rtfMedian: 0.2, wall: { medianMs: 100 } } };
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

try {
  testPercentiles();
  testVariantsAreComparable();
  testReportDoesNotExposeTranscript();
  testBenchmarkOptionsAcceptBaseline();
  testBenchmarkOptionsAcceptSpaceSeparatedValues();
  testAcceptanceDoesNotOverclaimHardwareOrMissingVariants();
  testAcceptanceRequiresRuntimeBackendConfirmation();
  console.log('Speech benchmark tests: passed');
} catch (error) {
  console.error('Speech benchmark tests: failed', error);
  process.exitCode = 1;
}
