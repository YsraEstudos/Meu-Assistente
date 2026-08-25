'use strict';

const { performance } = require('node:perf_hooks');

const AUDIO_SESSION_STATES = Object.freeze({
  IDLE: 'IDLE',
  STARTING: 'STARTING',
  CAPTURING: 'CAPTURING',
  FINALIZING: 'FINALIZING',
  DEGRADED: 'DEGRADED',
  ERROR: 'ERROR'
});

const AUDIO_SESSION_EVENTS = Object.freeze({
  START_REQUESTED: 'start_requested',
  CAPTURE_STARTED: 'capture_started',
  START_FAILED: 'start_failed',
  STOP_REQUESTED: 'stop_requested',
  CAPTURE_STOPPED: 'capture_stopped',
  HEALTH_DEGRADED: 'health_degraded',
  RECOVERY_STARTED: 'recovery_started',
  FINALIZED: 'finalized',
  ERROR: 'error',
  RESET: 'reset'
});

const TRANSITIONS = Object.freeze({
  [AUDIO_SESSION_STATES.IDLE]: Object.freeze({
    [AUDIO_SESSION_EVENTS.START_REQUESTED]: AUDIO_SESSION_STATES.STARTING
  }),
  [AUDIO_SESSION_STATES.STARTING]: Object.freeze({
    [AUDIO_SESSION_EVENTS.CAPTURE_STARTED]: AUDIO_SESSION_STATES.CAPTURING,
    [AUDIO_SESSION_EVENTS.START_FAILED]: AUDIO_SESSION_STATES.ERROR,
    [AUDIO_SESSION_EVENTS.STOP_REQUESTED]: AUDIO_SESSION_STATES.FINALIZING,
    [AUDIO_SESSION_EVENTS.HEALTH_DEGRADED]: AUDIO_SESSION_STATES.DEGRADED
  }),
  [AUDIO_SESSION_STATES.CAPTURING]: Object.freeze({
    [AUDIO_SESSION_EVENTS.STOP_REQUESTED]: AUDIO_SESSION_STATES.FINALIZING,
    [AUDIO_SESSION_EVENTS.CAPTURE_STOPPED]: AUDIO_SESSION_STATES.FINALIZING,
    [AUDIO_SESSION_EVENTS.HEALTH_DEGRADED]: AUDIO_SESSION_STATES.DEGRADED
  }),
  [AUDIO_SESSION_STATES.DEGRADED]: Object.freeze({
    [AUDIO_SESSION_EVENTS.RECOVERY_STARTED]: AUDIO_SESSION_STATES.STARTING,
    [AUDIO_SESSION_EVENTS.STOP_REQUESTED]: AUDIO_SESSION_STATES.FINALIZING,
    [AUDIO_SESSION_EVENTS.CAPTURE_STOPPED]: AUDIO_SESSION_STATES.FINALIZING
  }),
  [AUDIO_SESSION_STATES.FINALIZING]: Object.freeze({
    [AUDIO_SESSION_EVENTS.FINALIZED]: AUDIO_SESSION_STATES.IDLE
  }),
  [AUDIO_SESSION_STATES.ERROR]: Object.freeze()
});

const PRIVATE_METADATA_PATTERN = /(?:pcm|audio|transcript|prompt|response|buffer|content)/i;
const MAX_IDENTIFIER_LENGTH = 64;

function normalizeIdentifier(value) {
  if (typeof value !== 'string') return null;
  const normalized = value
    .trim()
    .replace(/[^a-zA-Z0-9_.:-]/g, '_')
    .slice(0, MAX_IDENTIFIER_LENGTH);
  if (!normalized || PRIVATE_METADATA_PATTERN.test(normalized)) return null;
  return normalized;
}

function defaultSessionIdFactory(generation) {
  return `session-${generation}`;
}

class AudioSessionStateMachine {
  constructor({ now = () => performance.now(), sessionIdFactory = defaultSessionIdFactory, onTransition } = {}) {
    this._now = typeof now === 'function' ? now : () => performance.now();
    this._sessionIdFactory = typeof sessionIdFactory === 'function'
      ? sessionIdFactory
      : defaultSessionIdFactory;
    this._onTransition = typeof onTransition === 'function' ? onTransition : null;

    this._state = AUDIO_SESSION_STATES.IDLE;
    this._sessionId = null;
    this._generation = 0;
    this._sessionStartedAt = null;
    this._stateStartedAt = 0;
    this._lastReasonCode = null;
    this._lastSource = null;
    this._lastNow = 0;
    this._lastNow = this._readNow();
    this._stateStartedAt = this._lastNow;
  }

  dispatch(event = {}) {
    const type = event && typeof event.type === 'string' ? event.type : null;
    const before = this.getSnapshot();

    if (!type) {
      return this._result(false, false, before, null);
    }

    if (type === AUDIO_SESSION_EVENTS.RESET) {
      if (this._state === AUDIO_SESSION_STATES.IDLE) {
        return this._result(true, false, before, null);
      }
      return this._applyTransition({
        type,
        nextState: AUDIO_SESSION_STATES.IDLE,
        event,
        before
      });
    }

    let nextState = TRANSITIONS[this._state]?.[type];
    if (type === AUDIO_SESSION_EVENTS.ERROR && this._state !== AUDIO_SESSION_STATES.IDLE) {
      nextState = AUDIO_SESSION_STATES.ERROR;
    }

    if (!nextState) {
      return this._result(false, false, before, null);
    }

    if (nextState === this._state) {
      return this._result(true, false, before, null);
    }

    return this._applyTransition({ type, nextState, event, before });
  }

  getSnapshot() {
    const now = this._readNow();
    const durationMs = this._sessionStartedAt === null
      ? 0
      : Math.max(0, now - this._sessionStartedAt);

    return Object.freeze({
      state: this._state,
      sessionId: this._sessionId,
      generation: this._generation,
      stateStartedAt: this._stateStartedAt,
      durationMs,
      lastReasonCode: this._lastReasonCode,
      lastSource: this._lastSource
    });
  }

  reset(reasonCode = 'reset') {
    return this.dispatch({
      type: AUDIO_SESSION_EVENTS.RESET,
      reasonCode,
      source: 'state_machine'
    });
  }

  _applyTransition({ type, nextState, event, before }) {
    const now = this._readNow();
    const reasonCode = normalizeIdentifier(event.reasonCode);
    const source = normalizeIdentifier(event.source);
    const sessionId = before.sessionId || this._createSessionId(this._generation + 1);

    if (type === AUDIO_SESSION_EVENTS.START_REQUESTED && before.state === AUDIO_SESSION_STATES.IDLE) {
      this._generation += 1;
      this._sessionId = sessionId;
      this._sessionStartedAt = now;
    }

    this._state = nextState;
    this._stateStartedAt = now;
    this._lastReasonCode = reasonCode;
    this._lastSource = source;

    if (nextState === AUDIO_SESSION_STATES.IDLE) {
      this._sessionId = null;
      this._sessionStartedAt = null;
      this._lastReasonCode = null;
      this._lastSource = null;
    }

    const snapshot = this.getSnapshot();
    const transition = Object.freeze({
      event: type,
      accepted: true,
      transitioned: true,
      from: before.state,
      to: nextState,
      sessionId,
      generation: before.generation || this._generation,
      reasonCode,
      source,
      durationMs: before.durationMs
    });

    if (this._onTransition) {
      try {
        this._onTransition(transition);
      } catch (_) {
        // Observability must never break the lifecycle owner.
      }
    }

    return this._result(true, true, snapshot, transition);
  }

  _result(accepted, transitioned, snapshot, transition) {
    return {
      accepted,
      transitioned,
      snapshot,
      transition
    };
  }

  _createSessionId(generation) {
    let value;
    try {
      value = this._sessionIdFactory(generation);
    } catch (_) {
      value = null;
    }
    const normalized = normalizeIdentifier(String(value ?? ''));
    return normalized || defaultSessionIdFactory(generation);
  }

  _readNow() {
    let value;
    try {
      value = Number(this._now());
    } catch (_) {
      value = this._lastNow;
    }
    if (!Number.isFinite(value)) value = this._lastNow;
    this._lastNow = Math.max(this._lastNow, value);
    return this._lastNow;
  }
}

module.exports = {
  AUDIO_SESSION_STATES,
  AUDIO_SESSION_EVENTS,
  AudioSessionStateMachine
};
