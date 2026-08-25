# Dual Audio PR1 — Session Baseline, Telemetry and State Machine

**Status:** Design approved in conversation; implementation pending review of this document.

**Date:** 2026-08-25

## Goal

Establish a safe, observable audio-session lifecycle contract without activating system-audio capture, moving VAD/STT, changing the legacy microphone pipeline, or upgrading Electron.

This PR is the first increment of the Dual Audio v2 plan. It creates the lifecycle boundary that later capture, VU, utility-process, VAD, STT, recovery, and rollout work can use without making the existing session behavior depend on the new pipeline.

## Current repository facts

- Repository: `OpenCluely`.
- Baseline branch: `feat/all-modifications`.
- Baseline commit: `699189a` (`feat: replicar todas as alterações do OpenCluely`).
- Installed Electron: `29.4.6`.
- The Main Process currently loads `src/services/speech.service.js` and owns the VAD/Whisper orchestration.
- The Renderer currently captures microphone audio with `getUserMedia()` and an existing `src/ui/audio-capture.worklet.js`, with ScriptProcessor fallback.
- The Main Process currently receives Renderer PCM through an Electron `MessagePort`, with legacy IPC fallback.
- `SpeechService` already has boolean lifecycle fields, a numeric recording session identifier, a finalization barrier, and cleanup logic, but it has no independent explicit state machine.
- Existing `performanceTracker` stores bounded events and strips sensitive metadata by key; the new session telemetry must add no audio or transcript content.
- The working tree already contains broad user changes unrelated to this PR. The implementation must stage only its own files and preserve all pre-existing modifications.

## Scope

### Included

1. A pure `AudioSessionStateMachine` module with explicit states, events, generation, and monotonic timing.
2. A thin Main Process observer that maps existing speech lifecycle events to the state machine.
3. Bounded, content-free transition telemetry.
4. Unit-style Node tests for the state machine and telemetry contract.
5. A reproducible baseline document recording the repository state and available validations.

### Explicitly excluded

- `getDisplayMedia()` or `desktopCapturer` system-audio capture.
- `session.setDisplayMediaRequestHandler()` changes.
- Any `SYSTEM` or `OTHERS` channel.
- VU meter changes.
- AudioWorklet protocol changes.
- Resampling, downmixing, ring buffers, queue limits, VAD, segmentation, overlap classification, or STT changes.
- `utilityProcess`, Worker, native runtime, or MessagePort topology changes.
- Feature-flag behavior or shadow-mode capture.
- Electron, Node, or dependency upgrades.
- Renderer, preload, or UI changes.

## Design

### 1. Pure state machine

Create `src/core/audio-session.js` with no Electron, DOM, logger, or service imports. The module exports:

```js
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

class AudioSessionStateMachine {
  constructor({ now, sessionIdFactory, onTransition } = {}) {}
  dispatch({ type, reasonCode, source } = {}) {}
  getSnapshot() {}
  reset(reasonCode = 'reset') {}
}
```

The implementation will use dependency injection for `now`, defaulting to a monotonic `performance.now()` source, and for the session-id factory so tests are deterministic. It will generate a new `generation` only when a new session is accepted from `IDLE`; the current session receives an opaque `sessionId`. Reset invalidates the active session and returns to `IDLE` without reusing its generation.

`dispatch()` returns a result with `accepted`, `transitioned`, and an immutable snapshot. Invalid transitions are rejected without mutating the machine. The machine never throws for an invalid lifecycle event, because telemetry must not break the Main Process. The optional transition callback is invoked only after a state mutation and is isolated by the Main adapter.

The event metadata is restricted to stable, bounded values: `reasonCode` and `source` are short identifier strings. The state machine does not accept arbitrary error objects, PCM, transcripts, prompts, or responses.

### 2. Transition table

| Current state | Event | Next state | Meaning |
| --- | --- | --- | --- |
| `IDLE` | `start_requested` | `STARTING` | A new audio session lifecycle has begun. |
| `STARTING` | `capture_started` | `CAPTURING` | The existing capture path reported that recording started. |
| `STARTING` | `start_failed` | `ERROR` | Startup failed before capture became active. |
| `STARTING` | `stop_requested` | `FINALIZING` | Cleanup was requested during startup. |
| `STARTING` | `health_degraded` | `DEGRADED` | Startup is alive but not healthy. |
| `CAPTURING` | `stop_requested` | `FINALIZING` | The user or lifecycle requested stop. |
| `CAPTURING` | `capture_stopped` | `FINALIZING` | The capture portion ended. |
| `CAPTURING` | `health_degraded` | `DEGRADED` | A non-fatal capture-health issue was reported. |
| `DEGRADED` | `recovery_started` | `STARTING` | Recovery is attempting to restore capture. |
| `DEGRADED` | `stop_requested` | `FINALIZING` | Cleanup was requested while degraded. |
| `DEGRADED` | `capture_stopped` | `FINALIZING` | Capture ended while degraded. |
| `FINALIZING` | `finalized` | `IDLE` | Cleanup and existing transcription finalization completed. |
| Any non-`IDLE` state | `error` | `ERROR` | A fatal session-level error was observed. |
| Any state | `reset` | `IDLE` | The lifecycle was invalidated, including application shutdown. |

Events not listed in the table are rejected without mutation. `reset` is idempotent so shutdown and repeated cleanup are safe. PR1 does not introduce an `OVERLAP` state; overlap belongs to the later dual-channel conversation state and must not be conflated with session health.

### 3. Main Process observation

Modify only `main.js` to create one state-machine instance per `ApplicationController` and observe the existing `speechService` lifecycle events:

- `recording-started`: dispatch `start_requested` if the observer is `IDLE`, then `capture_started`.
- `recording-capture-stopped`: dispatch `capture_stopped`.
- `recording-stopped`: dispatch `finalized`.
- `speechService` error events: dispatch `error` only when the observer has an active session; otherwise record a rejected/ignored lifecycle observation.
- `onWillQuit`: call `reset('app_shutdown')` after closing the existing audio ports.

This event observation deliberately avoids intercepting the duplicated `ipcMain.handle`/`ipcMain.on` start paths and the global shortcut path. The existing `SpeechService` events are the single observation boundary, so PR1 cannot change command ordering or cause a second start/stop call. Existing flags, session IDs, buffering, VAD, Whisper, Renderer capture, and UI broadcasts remain authoritative.

For each accepted or rejected observation, the adapter records only:

```text
event
accepted
transitioned
from
to
sessionId
generation
reasonCode
source
durationMs
```

The adapter catches telemetry failures and never propagates them into speech handlers. It uses the existing bounded `performanceTracker` and service logger. No new persistent audio store, file, IPC channel, preload API, or feature flag is introduced.

### 4. Baseline artifact

Create `docs/dual-audio/2026-08-25-pr1-baseline.md` during implementation. It will record:

- commit, branch, dirty-worktree warning, platform, Node, npm, and Electron versions;
- the exact existing test commands and their exit status;
- available scripts for lint, type checking, and build, including explicit `not configured` results where no script exists;
- syntax checks executed for changed JavaScript files;
- warnings observed in the baseline, without treating them as regressions;
- validation limits: no Windows device matrix, no real browser capture, no system-audio loopback, no Main/Renderer performance benchmark, and no production build claim unless separately executed.

The baseline must not claim a clean working tree because unrelated modifications are already present.

## Testing strategy

Create `scripts/test-audio-session.js` using the repository's existing direct-Node test style. It will cover:

1. Initial `IDLE` snapshot and deterministic injected clock/session IDs.
2. Every valid transition in the table.
3. Invalid events preserving state, session ID, generation, and timestamps.
4. Monotonic duration across injected clock changes.
5. Generation/session ID changes across repeated start/reset cycles.
6. Idempotent reset from active and idle states.
7. Startup failure, degradation, recovery, stop, and finalization paths.
8. Transition callback payload shape and bounded stable metadata.
9. A negative privacy assertion that telemetry payloads contain no keys or values named `pcm`, `audio`, `transcript`, `prompt`, `response`, `buffer`, or `content`.

Add the test to `package.json` and include it in `test:all` without removing or reordering existing gates in a way that changes their behavior.

The implementation verification will run:

```text
npm run test:all
node --check src/core/audio-session.js
node --check main.js
node scripts/test-audio-session.js
```

If the repository has no lint/type-check scripts, that absence will be reported rather than repaired as unrelated scope. The Electron build is not part of the PR1 claim unless it is run successfully after the user-owned changes are preserved.

## Acceptance criteria

- The state machine has the exact explicit states/events and rejection semantics above.
- The Main observes the existing speech lifecycle without moving or duplicating audio work.
- Telemetry is bounded, content-free, and incapable of taking down speech lifecycle handlers.
- Existing speech tests still pass with no new failures or warnings attributable to PR1.
- No new dependency or Electron version change is made.
- No system-audio request, video capture request, VU change, or STT behavior change is introduced.
- The baseline document clearly separates executed checks from unverified browser/device/production scenarios.
- Only PR1-owned files are staged and committed; existing user modifications remain untouched.

## Rollback

Rollback consists of reverting the PR1 commit. Because the state machine is observational and the legacy speech path remains unchanged, removing the Main observer and the test/docs additions restores the pre-PR1 behavior without data migration or user-state cleanup.

## Follow-up boundaries

The next design must be separate before implementation. PR2 may add the MIC VU path. A later PR may add Windows-first SYSTEM capture with capability gating and immediate video-track cleanup. Utility-process transport, explicit frame protocol, resampling, bounded queues, dual VAD, and SYSTEM STT remain independent increments and must not be folded into this PR1.
