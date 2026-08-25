'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  AudioMeter,
  METER_STATES,
  calculateMeterMetrics
} = require('../src/ui/audio-meter');

function approximately(actual, expected, tolerance = 1e-6) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`);
}

function createAnalyser(samples) {
  return {
    fftSize: samples.length,
    smoothingTimeConstant: 0,
    setSamples(nextSamples) {
      samples = Float32Array.from(nextSamples);
    },
    getFloatTimeDomainData(target) {
      target.set(samples);
    }
  };
}

function createRafClock() {
  let nextId = 0;
  const callbacks = new Map();
  return {
    request(callback) {
      const id = ++nextId;
      callbacks.set(id, callback);
      return id;
    },
    cancel(id) {
      callbacks.delete(id);
    },
    runNext(timestamp) {
      const [id, callback] = callbacks.entries().next().value || [];
      if (!callback) return false;
      callbacks.delete(id);
      callback(timestamp);
      return true;
    },
    get size() {
      return callbacks.size;
    }
  };
}

function testCalculateMeterMetrics() {
  const metrics = calculateMeterMetrics(Float32Array.from([0.5, -0.5, 0.25, -0.25]));

  approximately(metrics.rms, Math.sqrt(0.15625));
  assert.equal(metrics.peak, 0.5);
  approximately(metrics.dbfs, 20 * Math.log10(Math.sqrt(0.15625)));
  assert.equal(metrics.clipping, false);
  assert.equal(metrics.clippedSamples, 0);
  assert.equal(metrics.sampleCount, 4);

  const clipped = calculateMeterMetrics(Float32Array.from([1, -1, 0.2, -0.2]));
  assert.equal(clipped.clipping, true);
  assert.equal(clipped.clippedSamples, 2);

  const silence = calculateMeterMetrics(new Float32Array(4));
  assert.equal(silence.rms, 0);
  assert.equal(silence.peak, 0);
  assert.equal(silence.dbfs, -Infinity);
  assert.equal(silence.clipping, false);
}

function testMeterAppliesAttackReleaseAndPeakHold() {
  const analyser = createAnalyser([1, 1, 1, 1]);
  const meter = new AudioMeter({
    analyser,
    bufferSize: 4,
    attackMs: 50,
    releaseMs: 100,
    peakHoldMs: 500,
    now: () => 0
  });

  const first = meter.sample(0);
  assert.equal(first.rms, 1);
  assert.equal(first.peakHold, 1);
  assert.equal(first.clipping, true);

  analyser.setSamples([0, 0, 0, 0]);
  const released = meter.sample(10);
  assert.ok(released.rms > 0 && released.rms < 1);
  assert.equal(released.peakHold, 1);

  const afterHold = meter.sample(501);
  assert.equal(afterHold.peakHold, 0);
  assert.equal(afterHold.clipping, false);
}

function testMeterLifecycleIsIdempotentAndStateBounded() {
  const analyser = createAnalyser([0, 0, 0, 0]);
  const raf = createRafClock();
  const updates = [];
  const states = [];
  const meter = new AudioMeter({
    analyser,
    bufferSize: 4,
    onUpdate: (metrics) => updates.push(metrics),
    onStateChange: (state) => states.push(state),
    requestAnimationFrame: raf.request,
    cancelAnimationFrame: raf.cancel
  });

  assert.equal(meter.state, METER_STATES.IDLE);
  assert.equal(meter.start(), true);
  assert.equal(meter.start(), false);
  assert.equal(meter.state, METER_STATES.CAPTURING);
  assert.equal(raf.size, 1);
  assert.equal(raf.runNext(100), true);
  assert.equal(updates.length, 1);
  assert.equal(raf.size, 1);

  assert.equal(meter.setState(METER_STATES.DEGRADED), true);
  assert.equal(meter.setState(METER_STATES.DEGRADED), false);
  assert.equal(meter.stop(), true);
  assert.equal(meter.stop(), false);
  assert.equal(meter.state, METER_STATES.IDLE);
  assert.equal(raf.size, 0);
  assert.deepEqual(states, [METER_STATES.CAPTURING, METER_STATES.DEGRADED, METER_STATES.IDLE]);
}

function testMeterDoesNotOwnIpcOrRawAudioTransport() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui', 'audio-meter.js'), 'utf8');
  assert.doesNotMatch(source, /electronAPI|sendAudioChunk|postMessage/);
}

function testRendererMeterIntegrationContract() {
  const index = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const mainWindow = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui', 'main-window.js'), 'utf8');

  const meterScriptPosition = index.indexOf('./src/ui/audio-meter.js');
  const mainWindowScriptPosition = index.indexOf('./src/ui/main-window.js');
  assert.ok(meterScriptPosition >= 0, 'audio-meter.js must be loaded by the renderer');
  assert.ok(mainWindowScriptPosition > meterScriptPosition, 'audio-meter.js must load before main-window.js');
  assert.match(index, /id="micMeter"/);
  assert.match(index, /aria-label="Nível do microfone: inativo"/);
  assert.match(mainWindow, /createAnalyser\(\)/);
  assert.match(mainWindow, /new meterApi\.AudioMeter/);
  assert.match(mainWindow, /_stopMicMeter\(\)/);
  assert.match(mainWindow, /gain\.value\s*=\s*0/);
}

testCalculateMeterMetrics();
testMeterAppliesAttackReleaseAndPeakHold();
testMeterLifecycleIsIdempotentAndStateBounded();
testMeterDoesNotOwnIpcOrRawAudioTransport();
testRendererMeterIntegrationContract();

console.log('Audio meter tests: passed');
