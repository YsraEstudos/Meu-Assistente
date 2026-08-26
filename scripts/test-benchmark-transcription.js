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

try {
  testPercentiles();
  testVariantsAreComparable();
  testReportDoesNotExposeTranscript();
  testBenchmarkOptionsAcceptBaseline();
  console.log('Speech benchmark tests: passed');
} catch (error) {
  console.error('Speech benchmark tests: failed', error);
  process.exitCode = 1;
}
