'use strict';

(function attachAudioMeter(root, factory) {
    const api = factory();

    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    }
    if (root) {
        root.OpenCluelyAudioMeter = api;
    }
})(typeof window !== 'undefined' ? window : globalThis, function createAudioMeterApi() {
    const METER_STATES = Object.freeze({
        IDLE: 'IDLE',
        CAPTURING: 'CAPTURING',
        DEGRADED: 'DEGRADED',
        ERROR: 'ERROR'
    });

    const VALID_STATES = new Set(Object.values(METER_STATES));
    const DEFAULT_CLIPPING_THRESHOLD = 0.99;
    const DEFAULT_ATTACK_MS = 50;
    const DEFAULT_RELEASE_MS = 250;
    const DEFAULT_PEAK_HOLD_MS = 900;
    const DEFAULT_BUFFER_SIZE = 1024;

    function clamp(value, minimum, maximum) {
        return Math.min(maximum, Math.max(minimum, value));
    }

    function finiteOrZero(value) {
        return Number.isFinite(value) ? value : 0;
    }

    function positiveOrDefault(value, fallback) {
        const number = Number(value);
        return Number.isFinite(number) && number > 0 ? number : fallback;
    }

    function dbfsFromRms(rms) {
        return rms > 0 ? 20 * Math.log10(rms) : -Infinity;
    }

    function calculateMeterMetrics(samples, clippingThreshold = DEFAULT_CLIPPING_THRESHOLD) {
        const sampleCount = samples && Number.isFinite(samples.length) ? samples.length : 0;
        if (sampleCount === 0) {
            return {
                rms: 0,
                peak: 0,
                dbfs: -Infinity,
                clipping: false,
                clippedSamples: 0,
                sampleCount: 0
            };
        }

        let sumSquares = 0;
        let peak = 0;
        let clippedSamples = 0;

        for (let index = 0; index < sampleCount; index += 1) {
            const rawSample = finiteOrZero(Number(samples[index]));
            const absoluteSample = Math.abs(rawSample);
            const sample = clamp(rawSample, -1, 1);
            sumSquares += sample * sample;
            peak = Math.max(peak, Math.abs(sample));
            if (absoluteSample >= clippingThreshold) {
                clippedSamples += 1;
            }
        }

        const rms = Math.sqrt(sumSquares / sampleCount);
        return {
            rms,
            peak,
            dbfs: dbfsFromRms(rms),
            clipping: clippedSamples > 0,
            clippedSamples,
            sampleCount
        };
    }

    function defaultRequestAnimationFrame(callback) {
        if (typeof requestAnimationFrame === 'function') {
            return requestAnimationFrame(callback);
        }
        return setTimeout(() => callback(Date.now()), 16);
    }

    function defaultCancelAnimationFrame(id) {
        if (typeof cancelAnimationFrame === 'function') {
            cancelAnimationFrame(id);
            return;
        }
        clearTimeout(id);
    }

    class AudioMeter {
        constructor({
            analyser,
            bufferSize,
            attackMs = DEFAULT_ATTACK_MS,
            releaseMs = DEFAULT_RELEASE_MS,
            peakHoldMs = DEFAULT_PEAK_HOLD_MS,
            clippingThreshold = DEFAULT_CLIPPING_THRESHOLD,
            now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
            requestAnimationFrame: requestFrame = defaultRequestAnimationFrame,
            cancelAnimationFrame: cancelFrame = defaultCancelAnimationFrame,
            onUpdate,
            onStateChange
        } = {}) {
            this.analyser = analyser || null;
            this.bufferSize = Math.max(1, Math.floor(Number(bufferSize) || analyser?.fftSize || DEFAULT_BUFFER_SIZE));
            this.attackMs = positiveOrDefault(attackMs, DEFAULT_ATTACK_MS);
            this.releaseMs = positiveOrDefault(releaseMs, DEFAULT_RELEASE_MS);
            this.peakHoldMs = positiveOrDefault(peakHoldMs, DEFAULT_PEAK_HOLD_MS);
            this.clippingThreshold = clamp(Number(clippingThreshold) || DEFAULT_CLIPPING_THRESHOLD, 0, 1);
            this._now = typeof now === 'function' ? now : () => Date.now();
            this._requestAnimationFrame = typeof requestFrame === 'function' ? requestFrame : defaultRequestAnimationFrame;
            this._cancelAnimationFrame = typeof cancelFrame === 'function' ? cancelFrame : defaultCancelAnimationFrame;
            this._onUpdate = typeof onUpdate === 'function' ? onUpdate : null;
            this._onStateChange = typeof onStateChange === 'function' ? onStateChange : null;
            this._samples = new Float32Array(this.bufferSize);
            this._frameId = null;
            this._running = false;
            this._lastTimestamp = null;
            this._smoothedRms = 0;
            this._peakHold = 0;
            this._peakHoldUntil = 0;
            this.state = METER_STATES.IDLE;
        }

        get running() {
            return this._running;
        }

        setState(nextState) {
            if (!VALID_STATES.has(nextState) || nextState === this.state) {
                return false;
            }
            this.state = nextState;
            if (this._onStateChange) {
                try {
                    this._onStateChange(nextState);
                } catch (_) {
                    // UI state observers must never stop audio capture.
                }
            }
            return true;
        }

        start() {
            if (this._running) return false;
            if (!this.analyser || typeof this.analyser.getFloatTimeDomainData !== 'function' &&
                typeof this.analyser.getByteTimeDomainData !== 'function') {
                this.setState(METER_STATES.ERROR);
                return false;
            }

            this._running = true;
            this._lastTimestamp = null;
            this.setState(METER_STATES.CAPTURING);
            this._scheduleNextFrame();
            return true;
        }

        stop() {
            const wasActive = this._running || this.state !== METER_STATES.IDLE;
            this._running = false;
            if (this._frameId !== null) {
                try {
                    this._cancelAnimationFrame(this._frameId);
                } catch (_) {
                    // Best effort; state still resets below.
                }
                this._frameId = null;
            }
            this._lastTimestamp = null;
            this._smoothedRms = 0;
            this._peakHold = 0;
            this._peakHoldUntil = 0;
            this.setState(METER_STATES.IDLE);
            return wasActive;
        }

        sample(timestamp = this._now()) {
            const currentTime = Number.isFinite(Number(timestamp)) ? Number(timestamp) : Number(this._now());
            const rawMetrics = this._readMetrics();
            const elapsedMs = this._lastTimestamp === null
                ? 0
                : Math.max(0, currentTime - this._lastTimestamp);
            this._lastTimestamp = currentTime;

            if (this._lastTimestamp === currentTime && elapsedMs === 0) {
                this._smoothedRms = rawMetrics.rms;
            } else {
                const timeConstant = rawMetrics.rms >= this._smoothedRms ? this.attackMs : this.releaseMs;
                const coefficient = 1 - Math.exp(-elapsedMs / timeConstant);
                this._smoothedRms += (rawMetrics.rms - this._smoothedRms) * coefficient;
            }

            if (rawMetrics.peak >= this._peakHold) {
                this._peakHold = rawMetrics.peak;
                this._peakHoldUntil = currentTime + this.peakHoldMs;
            } else if (currentTime > this._peakHoldUntil) {
                this._peakHold = 0;
            }

            const metrics = Object.freeze({
                rms: this._smoothedRms,
                rawRms: rawMetrics.rms,
                peak: rawMetrics.peak,
                peakHold: this._peakHold,
                dbfs: dbfsFromRms(this._smoothedRms),
                rawDbfs: rawMetrics.dbfs,
                clipping: rawMetrics.clipping,
                clippedSamples: rawMetrics.clippedSamples,
                sampleCount: rawMetrics.sampleCount,
                state: this.state,
                capturedAt: currentTime
            });

            if (this._onUpdate) {
                try {
                    this._onUpdate(metrics);
                } catch (_) {
                    // UI rendering failures must not stop the meter loop.
                }
            }
            return metrics;
        }

        _readMetrics() {
            try {
                if (typeof this.analyser.getFloatTimeDomainData === 'function') {
                    this.analyser.getFloatTimeDomainData(this._samples);
                    return calculateMeterMetrics(this._samples, this.clippingThreshold);
                }

                const byteSamples = new Uint8Array(this.bufferSize);
                this.analyser.getByteTimeDomainData(byteSamples);
                for (let index = 0; index < byteSamples.length; index += 1) {
                    this._samples[index] = (byteSamples[index] - 128) / 128;
                }
                return calculateMeterMetrics(this._samples, this.clippingThreshold);
            } catch (_) {
                return calculateMeterMetrics(null, this.clippingThreshold);
            }
        }

        _scheduleNextFrame() {
            if (!this._running) return;
            this._frameId = this._requestAnimationFrame((timestamp) => {
                this._frameId = null;
                if (!this._running) return;
                this.sample(timestamp);
                this._scheduleNextFrame();
            });
        }
    }

    return {
        AudioMeter,
        METER_STATES,
        calculateMeterMetrics
    };
});
