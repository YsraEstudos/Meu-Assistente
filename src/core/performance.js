'use strict';

const { performance } = require('node:perf_hooks');

const MAX_EVENTS = 256;
const PRIVATE_PATTERN = /(?:pcm|audio|transcript|prompt|response|buffer|content)/i;

class PerformanceTracker {
  constructor() {
    this.events = [];
    this.sequence = 0;
  }

  mark(name, metadata = {}) {
    const event = {
      id: ++this.sequence,
      name: String(name),
      at: performance.now(),
      metadata: this._safeMetadata(metadata)
    };
    this.events.push(event);
    if (this.events.length > MAX_EVENTS) this.events.shift();
    return event.id;
  }

  getRecent(limit = 50) {
    return this.events
      .slice(-Math.max(0, Number(limit) || 0))
      .map((event) => ({
        ...event,
        metadata: { ...event.metadata }
      }));
  }

  _safeMetadata(metadata) {
    if (!metadata || typeof metadata !== 'object') return {};
    const safe = {};
    for (const [key, value] of Object.entries(metadata)) {
      if (PRIVATE_PATTERN.test(key)) continue;
      if (typeof value === 'string' && PRIVATE_PATTERN.test(value)) continue;
      if (['string', 'number', 'boolean'].includes(typeof value) || value == null) {
        safe[key] = value;
      }
    }
    return safe;
  }
}

module.exports = new PerformanceTracker();
