'use strict';

const { performance } = require('node:perf_hooks');
const os = require('os');

const MAX_EVENTS = 256;

class PerformanceTracker {
  constructor() {
    this.enabled = process.env.OPENCLUEY_PERF === '1' || process.env.NODE_ENV !== 'production';
    this.events = [];
    this.active = new Map();
    this.sequence = 0;
  }

  mark(name, metadata = {}) {
    if (!this.enabled) return null;
    const event = {
      id: ++this.sequence,
      name: String(name),
      at: performance.now(),
      timestamp: Date.now(),
      metadata: this._safeMetadata(metadata)
    };
    this.events.push(event);
    if (this.events.length > MAX_EVENTS) this.events.shift();
    return event.id;
  }

  begin(name, metadata = {}) {
    if (!this.enabled) return null;
    const token = `${String(name)}:${++this.sequence}`;
    this.active.set(token, { name: String(name), start: performance.now(), metadata });
    return token;
  }

  end(token, metadata = {}) {
    if (!token || !this.active.has(token)) return null;
    const span = this.active.get(token);
    this.active.delete(token);
    const durationMs = Math.max(0, performance.now() - span.start);
    this.mark(span.name, { ...span.metadata, ...metadata, durationMs: Number(durationMs.toFixed(2)) });
    return durationMs;
  }

  measure(name, start, metadata = {}) {
    if (!this.enabled || !Number.isFinite(start)) return null;
    const durationMs = Math.max(0, performance.now() - start);
    this.mark(name, { ...metadata, durationMs: Number(durationMs.toFixed(2)) });
    return durationMs;
  }

  getRecent(limit = 50) {
    return this.events.slice(-Math.max(0, limit)).map((event) => ({ ...event, metadata: { ...event.metadata } }));
  }

  getSystemSnapshot() {
    const memory = process.memoryUsage();
    return {
      uptimeMs: Math.round(process.uptime() * 1000),
      cpuCount: os.cpus().length,
      memory: {
        rss: memory.rss,
        heapUsed: memory.heapUsed,
        heapTotal: memory.heapTotal,
        external: memory.external
      }
    };
  }

  snapshot(limit = 50) {
    return { enabled: this.enabled, events: this.getRecent(limit), system: this.getSystemSnapshot() };
  }

  _safeMetadata(metadata) {
    if (!metadata || typeof metadata !== 'object') return {};
    const output = {};
    for (const [key, value] of Object.entries(metadata)) {
      if (/key|token|secret|password|prompt|response|content/i.test(key)) {
        if (typeof value === 'string') output[key] = { length: value.length };
        continue;
      }
      if (['string', 'number', 'boolean'].includes(typeof value) || value == null) output[key] = value;
    }
    return output;
  }
}

module.exports = new PerformanceTracker();
