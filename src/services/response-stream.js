'use strict';

const config = require('../core/config');
const performanceTracker = require('../core/performance');

class ResponseStream {
  constructor({ intervalMs } = {}) {
    this.intervalMs = Number(intervalMs || config.get('performance.streamBatchMs')) || 40;
    this.streams = new Map();
  }

  start({ messageId, sessionId, skill, emit } = {}) {
    if (!messageId || typeof emit !== 'function') throw new Error('ResponseStream requires messageId and emit');
    this.end(messageId, { reason: 'replaced' });
    const stream = { messageId, sessionId: sessionId || null, skill: skill || 'general', emit, sequence: 0, pending: '', timer: null, closed: false, startedAt: Date.now(), firstDeltaAt: null };
    this.streams.set(messageId, stream);
    emit('start', this._envelope(stream, { sequence: 0, content: '' }));
    return messageId;
  }

  append(messageId, delta) {
    const stream = this.streams.get(messageId);
    if (!stream || stream.closed || !delta) return false;
    stream.pending += String(delta);
    if (!stream.timer) {
      stream.timer = setTimeout(() => {
        stream.timer = null;
        this.flush(messageId);
      }, this.intervalMs);
    }
    return true;
  }

  flush(messageId) {
    const stream = this.streams.get(messageId);
    if (!stream || stream.closed || !stream.pending) return false;
    const delta = stream.pending;
    stream.pending = '';
    stream.sequence += 1;
    if (stream.firstDeltaAt == null) {
      stream.firstDeltaAt = Date.now();
      performanceTracker.mark('response-first-delta', { messageId, sequence: stream.sequence, deltaLength: delta.length });
    }
    stream.emit('delta', this._envelope(stream, { delta, content: delta, sequence: stream.sequence }));
    performanceTracker.mark('response-stream-delta', { messageId, sequence: stream.sequence, deltaLength: delta.length });
    return true;
  }

  end(messageId, { response = '', error = null, reason = 'completed' } = {}) {
    const stream = this.streams.get(messageId);
    if (!stream) return false;
    if (stream.timer) clearTimeout(stream.timer);
    stream.timer = null;
    this.flush(messageId);
    stream.closed = true;
    if (error) {
      stream.emit('error', this._envelope(stream, { error: String(error), content: '', sequence: stream.sequence }));
    } else {
      const finalContent = String(response || '');
      stream.emit('end', this._envelope(stream, { response: finalContent, content: finalContent, reason, durationMs: Date.now() - stream.startedAt, sequence: stream.sequence }));
    }
    this.streams.delete(messageId);
    return true;
  }

  _envelope(stream, extra = {}) {
    return { messageId: stream.messageId, sessionId: stream.sessionId, skill: stream.skill, ...extra };
  }
}

module.exports = ResponseStream;
