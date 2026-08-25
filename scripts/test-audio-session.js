'use strict';

const assert = require('node:assert/strict');

const {
  AUDIO_SESSION_EVENTS,
  AUDIO_SESSION_STATES,
  AudioSessionStateMachine
} = require('../src/core/audio-session');
const performanceTracker = require('../src/core/performance');

const {
  CAPTURE_STARTED,
  CAPTURE_STOPPED,
  ERROR,
  FINALIZED,
  HEALTH_DEGRADED,
  RECOVERY_STARTED,
  RESET,
  START_FAILED,
  START_REQUESTED,
  STOP_REQUESTED
} = AUDIO_SESSION_EVENTS;

const {
  CAPTURING,
  DEGRADED,
  ERROR: ERROR_STATE,
  FINALIZING,
  IDLE,
  STARTING
} = AUDIO_SESSION_STATES;

function createMachine({ startAt = 0, ids = ['session-1'], onTransition } = {}) {
  let now = startAt;
  let idIndex = 0;
  const machine = new AudioSessionStateMachine({
    now: () => now,
    sessionIdFactory: () => ids[idIndex++] || `session-${idIndex}`,
    onTransition
  });

  return {
    machine,
    setTime(value) {
      now = value;
    }
  };
}

function startCapturing(machine) {
  assert.equal(machine.dispatch({ type: START_REQUESTED }).accepted, true);
  assert.equal(machine.dispatch({ type: CAPTURE_STARTED }).accepted, true);
}

function startDegraded(machine) {
  startCapturing(machine);
  assert.equal(machine.dispatch({ type: HEALTH_DEGRADED }).accepted, true);
}

function expectState(machine, state) {
  assert.equal(machine.getSnapshot().state, state);
}

function testInitialSnapshotAndDeterministicClock() {
  const transitions = [];
  const { machine, setTime } = createMachine({
    onTransition: (payload) => transitions.push(payload)
  });

  assert.deepEqual(machine.getSnapshot(), {
    state: IDLE,
    sessionId: null,
    generation: 0,
    stateStartedAt: 0,
    durationMs: 0,
    lastReasonCode: null,
    lastSource: null
  });

  assert.equal(machine.dispatch({
    type: START_REQUESTED,
    reasonCode: 'user_start',
    source: 'test'
  }).accepted, true);
  setTime(125);

  const result = machine.dispatch({
    type: CAPTURE_STARTED,
    reasonCode: 'capture_ready',
    source: 'speech_service'
  });

  assert.equal(result.snapshot.state, CAPTURING);
  assert.equal(result.snapshot.durationMs, 125);
  assert.equal(result.snapshot.sessionId, 'session-1');
  assert.equal(result.snapshot.generation, 1);
  assert.equal(Object.isFrozen(result.snapshot), true);
  assert.equal(transitions.length, 2);
}

function testEveryValidTransition() {
  {
    const { machine } = createMachine();
    assert.equal(machine.dispatch({ type: START_REQUESTED }).snapshot.state, STARTING);
  }

  {
    const { machine } = createMachine();
    assert.equal(machine.dispatch({ type: START_REQUESTED }).accepted, true);
    assert.equal(machine.dispatch({ type: CAPTURE_STARTED }).snapshot.state, CAPTURING);
  }

  {
    const { machine } = createMachine();
    assert.equal(machine.dispatch({ type: START_REQUESTED }).accepted, true);
    assert.equal(machine.dispatch({ type: START_FAILED }).snapshot.state, ERROR_STATE);
  }

  {
    const { machine } = createMachine();
    assert.equal(machine.dispatch({ type: START_REQUESTED }).accepted, true);
    assert.equal(machine.dispatch({ type: STOP_REQUESTED }).snapshot.state, FINALIZING);
  }

  {
    const { machine } = createMachine();
    assert.equal(machine.dispatch({ type: START_REQUESTED }).accepted, true);
    assert.equal(machine.dispatch({ type: HEALTH_DEGRADED }).snapshot.state, DEGRADED);
    assert.equal(machine.dispatch({ type: RECOVERY_STARTED }).snapshot.state, STARTING);
  }

  for (const event of [STOP_REQUESTED, CAPTURE_STOPPED]) {
    const { machine } = createMachine();
    startCapturing(machine);
    assert.equal(machine.dispatch({ type: event }).snapshot.state, FINALIZING);
  }

  {
    const { machine } = createMachine();
    startCapturing(machine);
    assert.equal(machine.dispatch({ type: HEALTH_DEGRADED }).snapshot.state, DEGRADED);
    assert.equal(machine.dispatch({ type: STOP_REQUESTED }).snapshot.state, FINALIZING);
  }

  for (const event of [STOP_REQUESTED, CAPTURE_STOPPED]) {
    const { machine } = createMachine();
    startDegraded(machine);
    assert.equal(machine.dispatch({ type: event }).snapshot.state, FINALIZING);
  }

  {
    const { machine } = createMachine();
    startCapturing(machine);
    assert.equal(machine.dispatch({ type: STOP_REQUESTED }).accepted, true);
    assert.equal(machine.dispatch({ type: FINALIZED }).snapshot.state, IDLE);
  }

  for (const stateSetup of [startCapturing, startDegraded]) {
    const { machine } = createMachine();
    stateSetup(machine);
    assert.equal(machine.dispatch({ type: ERROR, reasonCode: 'fatal' }).snapshot.state, ERROR_STATE);
  }

  {
    const { machine } = createMachine();
    assert.equal(machine.dispatch({ type: RESET }).accepted, true);
    expectState(machine, IDLE);
    startCapturing(machine);
    assert.equal(machine.dispatch({ type: RESET }).snapshot.state, IDLE);
  }
}

function testInvalidEventsDoNotMutateState() {
  const { machine } = createMachine();
  startCapturing(machine);
  const before = machine.getSnapshot();

  for (const event of [CAPTURE_STARTED, START_REQUESTED, FINALIZED, 'unknown_event', null]) {
    const result = machine.dispatch({ type: event });
    assert.equal(result.accepted, false);
    assert.equal(result.transitioned, false);
    assert.deepEqual(result.snapshot, before);
  }

  const malformed = machine.dispatch({ type: ERROR, reasonCode: { pcm: new Float32Array([1]) } });
  assert.equal(malformed.accepted, true);
  assert.equal(malformed.snapshot.state, ERROR_STATE);
  assert.equal(malformed.snapshot.lastReasonCode, null);
}

function testMonotonicDurationAndNewGeneration() {
  const { machine, setTime } = createMachine({ startAt: 100, ids: ['first', 'second'] });
  machine.dispatch({ type: START_REQUESTED });
  setTime(160);
  assert.equal(machine.getSnapshot().durationMs, 60);

  setTime(120);
  assert.equal(machine.getSnapshot().durationMs, 60);

  machine.dispatch({ type: RESET, reasonCode: 'reload' });
  assert.equal(machine.getSnapshot().generation, 1);
  machine.dispatch({ type: START_REQUESTED });
  assert.equal(machine.getSnapshot().sessionId, 'second');
  assert.equal(machine.getSnapshot().generation, 2);
}

function testResetIsIdempotent() {
  const { machine } = createMachine();
  const first = machine.reset('shutdown');
  const second = machine.reset('shutdown_again');

  assert.equal(first.accepted, true);
  assert.equal(second.accepted, true);
  assert.equal(second.transitioned, false);
  assert.equal(second.snapshot.state, IDLE);
  assert.equal(second.snapshot.sessionId, null);
}

function testTransitionTelemetryIsBoundedAndPrivate() {
  const transitions = [];
  const { machine } = createMachine({
    onTransition: (payload) => transitions.push(payload)
  });

  machine.dispatch({
    type: START_REQUESTED,
    reasonCode: 'a'.repeat(300),
    source: 'source with spaces and unsafe chars !'
  });

  assert.equal(transitions.length, 1);
  const payload = transitions[0];
  assert.deepEqual(Object.keys(payload).sort(), [
    'accepted',
    'durationMs',
    'event',
    'from',
    'generation',
    'reasonCode',
    'sessionId',
    'source',
    'to',
    'transitioned'
  ]);
  assert.equal(payload.accepted, true);
  assert.equal(payload.transitioned, true);
  assert.ok(payload.reasonCode.length <= 64);
  assert.ok(payload.source.length <= 64);

  const serialized = JSON.stringify(payload).toLowerCase();
  for (const forbidden of ['pcm', 'audio', 'transcript', 'prompt', 'response', 'buffer', 'content']) {
    assert.equal(serialized.includes(forbidden), false, `telemetry leaked ${forbidden}`);
  }
}

function testPerformanceTelemetryIsBoundedAndPrivate() {
  for (let index = 0; index < 300; index += 1) {
    performanceTracker.mark('audio-session-transition', {
      event: 'capture_started',
      accepted: true,
      transitioned: true,
      generation: index + 1,
      durationMs: index
    });
  }

  const recent = performanceTracker.getRecent(400);
  assert.ok(recent.length <= 256);
  const serialized = JSON.stringify(recent.map((entry) => entry.metadata)).toLowerCase();
  for (const forbidden of ['pcm', 'audio', 'transcript', 'prompt', 'response', 'buffer', 'content']) {
    assert.equal(serialized.includes(forbidden), false, `performance telemetry leaked ${forbidden}`);
  }
}

testInitialSnapshotAndDeterministicClock();
testEveryValidTransition();
testInvalidEventsDoNotMutateState();
testMonotonicDurationAndNewGeneration();
testResetIsIdempotent();
testTransitionTelemetryIsBoundedAndPrivate();
testPerformanceTelemetryIsBoundedAndPrivate();

console.log('Audio session state-machine tests: passed');
