# Dual Audio PR1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an explicit, observable audio-session lifecycle boundary while leaving the legacy microphone, VAD, STT, Renderer, IPC, and Electron behavior unchanged.

**Architecture:** A pure CommonJS state machine owns only lifecycle state, generation, session identity, and monotonic timing. `main.js` observes existing `SpeechService` events through a thin adapter that emits bounded lifecycle telemetry to the PR1-local `performanceTracker`; no PCM, transcript, prompt, response, or new IPC path is introduced.

**Tech Stack:** Node.js built-in assertions and direct scripts, CommonJS, Electron 29.4.6, bounded CommonJS `performanceTracker`, existing Winston service logger.

**Spec:** `docs/superpowers/specs/2026-08-25-dual-audio-pr1-design.md`

## Global Constraints

- Keep Electron at `29.4.6` and add no dependency.
- Keep `legacy` speech capture behavior authoritative; do not add SYSTEM capture, VU, AudioWorklet protocol, DSP, VAD, STT, utility-process, or feature-flag behavior.
- Do not modify `preload.js`, Renderer files, `src/services/speech.service.js`, or existing capture ordering.
- Accept only bounded `reasonCode` and `source` metadata; never accept or emit PCM, transcript, prompt, response, or arbitrary error objects in the state-machine contract.
- Preserve the original checkout's pre-existing working-tree changes; this reconstructed worktree contains only PR1-owned files.
- Use deterministic injected clocks and session-id factories in tests.

---

### Task 1: Define the failing state-machine and privacy tests

**Files:**
- Create: `scripts/test-audio-session.js`
- Read: `docs/superpowers/specs/2026-08-25-dual-audio-pr1-design.md`

**Interfaces:**
- Consumes: the not-yet-created `AudioSessionStateMachine`, `AUDIO_SESSION_STATES`, and `AUDIO_SESSION_EVENTS` exports.
- Produces: executable assertions for every accepted transition, rejection semantics, generation/session identity, monotonic duration, reset idempotence, callback metadata, and telemetry privacy.

- [ ] **Step 1: Write the failing test**

Create a direct Node script with a deterministic `clock` and `sessionIdFactory`. Assert the public contract below:

```js
const machine = new AudioSessionStateMachine({
  now: () => clock,
  sessionIdFactory: () => `session-${++sessionNumber}`,
  onTransition: (payload) => transitions.push(payload)
});

assert.deepStrictEqual(machine.getSnapshot(), {
  state: AUDIO_SESSION_STATES.IDLE,
  sessionId: null,
  generation: 0,
  stateStartedAt: 0,
  durationMs: 0,
  lastReasonCode: null,
  lastSource: null
});

assert.equal(machine.dispatch({ type: AUDIO_SESSION_EVENTS.START_REQUESTED }).accepted, true);
assert.equal(machine.getSnapshot().state, AUDIO_SESSION_STATES.STARTING);
clock = 125;
assert.equal(machine.dispatch({
  type: AUDIO_SESSION_EVENTS.CAPTURE_STARTED,
  reasonCode: 'capture_ready',
  source: 'speech_service'
}).snapshot.durationMs, 125);
```

Add cases for all valid table transitions, invalid transitions preserving a deep copy of the snapshot, startup failure, degraded recovery, `ERROR`, reset from active/idle, new generation after reset, callback payload keys, bounded metadata truncation/normalization, and forbidden privacy terms (`pcm`, `audio`, `transcript`, `prompt`, `response`, `buffer`, `content`) absent from the serialized transition payload.

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/test-audio-session.js`

Expected: FAIL because `src/core/audio-session.js` does not exist yet. Fix only test typos if the failure is unrelated to the missing module.

- [ ] **Step 3: Do not add production code in this task**

Keep the test red. The next task implements only the API the test describes.

- [ ] **Step 4: Record the red result**

Capture the missing-module failure in the working notes used for the final baseline; do not weaken assertions to make the script pass.

### Task 2: Implement the pure `AudioSessionStateMachine`

**Files:**
- Create: `src/core/audio-session.js`
- Create: `src/core/performance.js`
- Test: `scripts/test-audio-session.js`

**Interfaces:**
- Consumes: deterministic `now`, `sessionIdFactory`, and optional `onTransition` callbacks.
- Produces: frozen state/event constants and a `AudioSessionStateMachine` class with `dispatch(event)`, `getSnapshot()`, and `reset(reasonCode)`.

- [ ] **Step 1: Implement the smallest transition table that satisfies the red tests**

Export these exact values and class methods:

```js
module.exports = {
  AUDIO_SESSION_STATES,
  AUDIO_SESSION_EVENTS,
  AudioSessionStateMachine
};
```

Use this transition map: `IDLE/start_requested -> STARTING`; `STARTING/capture_started -> CAPTURING`; `STARTING/start_failed -> ERROR`; `STARTING/stop_requested -> FINALIZING`; `STARTING/health_degraded -> DEGRADED`; `CAPTURING/stop_requested|capture_stopped -> FINALIZING`; `CAPTURING/health_degraded -> DEGRADED`; `DEGRADED/recovery_started -> STARTING`; `DEGRADED/stop_requested|capture_stopped -> FINALIZING`; `FINALIZING/finalized -> IDLE`; any non-IDLE `error -> ERROR`; any state `reset -> IDLE`.

Generate `generation + 1` and a fresh `sessionId` only for an accepted `start_requested` from `IDLE`. Use `performance.now()` through `node:perf_hooks` by default. Clamp or normalize `reasonCode` and `source` to short identifier strings; reject malformed event input without throwing or mutating state. Return `{ accepted, transitioned, snapshot }` and freeze snapshots so callers cannot mutate state.

- [ ] **Step 2: Run the focused test to verify it passes**

Run: `node scripts/test-audio-session.js`

Expected: PASS with all state, timing, generation, callback, and privacy assertions green.

- [ ] **Step 3: Refactor only after green**

Keep the module free of Electron, DOM, logger, service, audio, and transcript imports. Preserve the same public contract and rerun the focused test after any cleanup.

### Task 3: Observe existing SpeechService lifecycle in Main

**Files:**
- Modify: `main.js` near the service imports, `ApplicationController` constructor, `setupServiceEventHandlers()`, and `onWillQuit()`.
- Test: `scripts/test-audio-session.js` (extend with adapter-shape/privacy helper assertions only if needed)

**Interfaces:**
- Consumes: `AudioSessionStateMachine` and existing `speechService` events `recording-started`, `recording-capture-stopped`, `recording-stopped`, and `error`.
- Produces: Main-only observation with bounded telemetry fields `event`, `accepted`, `transitioned`, `from`, `to`, `sessionId`, `generation`, `reasonCode`, `source`, and `durationMs`.

- [ ] **Step 1: Add a focused failing assertion for observer mapping**

Before wiring, specify the mapping in a small pure helper shape or testable method: `recording-started` dispatches `start_requested` only when the observer is `IDLE`, then dispatches `capture_started`; `recording-capture-stopped` dispatches `capture_stopped`; `recording-stopped` dispatches `finalized`; `error` dispatches `error` only for an active observer. Assert that observer failures cannot escape the speech event callback and that no payload field contains forbidden content keys.

- [ ] **Step 2: Run the focused assertion to verify it fails**

Run: `node scripts/test-audio-session.js`

Expected: FAIL only for the not-yet-wired observer behavior.

- [ ] **Step 3: Implement the thin observer without changing speech commands**

Import the state machine in `main.js`, instantiate one per `ApplicationController`, and add a private method that dispatches an event and records only sanitized lifecycle metadata with `performanceTracker.mark('audio-session-transition', metadata)`. Catch both dispatch and telemetry errors, logging only a stable error code/message through the existing service logger. Do not alter `speechService.startRecording()`, `stopRecording()`, audio-port handling, Renderer broadcasts, or transcription flow.

On `recording-started`, preserve the existing `_speechSessionId` assignment, then observe the lifecycle. On `recording-stopped`, observe finalization before/after existing logic without changing its ordering of speech behavior. In `onWillQuit`, call `audioSession.reset('app_shutdown')` after existing cleanup begins and before shutting down services. Ignore stale/idle error observations without fabricating a session.

- [ ] **Step 4: Run the focused test and syntax check**

Run: `node scripts/test-audio-session.js` and `node --check main.js`

Expected: PASS with no new syntax errors; existing speech behavior remains unchanged because the observer only listens to already-emitted events.

### Task 4: Add the test gate and reproducible baseline

**Files:**
- Modify: `package.json` scripts `test:all` and add `test:audio-session`.
- Create: `docs/dual-audio/2026-08-25-pr1-baseline.md`

**Interfaces:**
- Consumes: the focused test command and repository metadata collected from the clean reconstruction worktree.
- Produces: repeatable `npm run test:audio-session` and a baseline that distinguishes executed checks from unverified browser/device/build scenarios.

- [ ] **Step 1: Add the smallest package-script change**

Add:

```json
"test:audio-session": "node scripts/test-audio-session.js"
```

Append `npm run test:audio-session` to `test:all` without removing or reordering the existing `test-speech-finalization` and `test:gpu` gates.

- [ ] **Step 2: Run the focused npm gate**

Run: `npm run test:audio-session`

Expected: PASS.

- [ ] **Step 3: Write the baseline with observed values**

Record branch, current commit, clean-worktree status, platform, Node, npm, Electron, exact command/exit status results, absence of lint/type-check scripts if still absent, syntax checks, and validation limits. Do not claim Windows device coverage, real system loopback, production build success, or performance results unless actually run.

- [ ] **Step 4: Run the full existing gate**

Run: `npm run test:all`

Expected: existing tests plus `test:audio-session` pass. If a pre-existing test fails, report its exact command and distinguish it from PR1 regressions.

### Task 5: Final verification and staging review

**Files:**
- Read: all PR1-owned files and `git diff --stat`/`git diff --check`.

**Interfaces:**
- Consumes: the completed PR1 implementation and test outputs.
- Produces: evidence-backed completion status and a staging recommendation that excludes every unrelated user modification.

- [ ] **Step 1: Run all required syntax checks**

Run:

```text
node --check src/core/audio-session.js
node --check main.js
node scripts/test-audio-session.js
npm run test:all
```

- [ ] **Step 2: Inspect the diff for scope and privacy**

Run: `git diff --check`; inspect `git diff -- src/core/audio-session.js main.js package.json scripts/test-audio-session.js docs/dual-audio/2026-08-25-pr1-baseline.md` and verify there are no SYSTEM capture calls, Renderer/preload edits, feature flags, new dependencies, PCM/transcript values in telemetry, or accidental changes to unrelated files.

- [ ] **Step 3: Report validation limits and working-tree state**

Return the passing commands, changed files, unverified scenarios, and exact pre-existing dirty files. Do not stage or commit unless the user explicitly requests it.
