# Dual Audio PR1 Baseline — 2026-08-25

## Scope

This baseline covers the first Dual Audio increment: an observational audio-session state machine and bounded lifecycle telemetry. It does not activate system-audio capture, change the legacy microphone path, alter the AudioWorklet protocol, move VAD/STT, or change Electron.

## Repository state

- Repository: `OpenCluely`
- Branch: `codex/dual-audio-pr1`
- HEAD at validation: `8c9ec843a565c94fcfe586686478ddc2d740e8b9`
- Upstream status: local branch is based on `8c9ec843a565c94fcfe586686478ddc2d740e8b9`
- Working tree: clean at worktree creation; only PR1 files are present as changes
- Platform: Microsoft Windows 11 Home, version `10.0.26200.0`
- Node: `v26.7.0`
- npm: `11.10.1`
- Electron dependency: `29.4.6`

The reconstruction deliberately excludes the original checkout's unrelated application/UI/service changes, audio assets, worklet, benchmark scripts, and security reports. No unrelated file was cleaned or restored in the original checkout.

## Checks executed

### Base gates

The unchanged base test scripts were executed before the PR1-specific gate and exited `0`:

- `test-speech-finalization`: passed
- `test:gpu`: passed using the detected AMD Radeon RX 6600 and Vulkan

Existing warnings were observed for an absent Gemini API key and simulated Whisper fallback paths inside the speech tests.

### PR1 focused checks

- `node scripts/test-audio-session.js`: passed
- `npm run test:audio-session`: passed
- `node --check src/core/audio-session.js`: passed
- `node --check main.js`: passed
- `git diff --check`: completed with existing CRLF normalization warnings only

### Post-PR1 full gate

`npm run test:all` was executed after the new gate was added and exited `0`:

- `test-speech-finalization`: passed
- `test:gpu`: passed using Vulkan and the AMD Radeon RX 6600
- `test:audio-session`: passed

The same pre-existing Gemini/Whisper warning patterns appeared; no new warning attributable to the session state machine was observed.

## Tooling inventory

- Lint script: not configured (`package.json` has no `scripts.lint`)
- Type-check script: not configured (`package.json` has no `scripts.typecheck`)
- New dependencies: none
- Electron upgrade: none
- Production/package build: not executed for this baseline

## PR1 changes validated

- Pure `src/core/audio-session.js` with explicit lifecycle states/events, monotonic injected timing, generation/session identity, reset, and immutable snapshots.
- `scripts/test-audio-session.js` with valid/invalid transition, timing, generation, callback, reset, and privacy assertions.
- `src/core/performance.js` with a 256-event bounded metadata buffer used by the observer.
- `main.js` observer for existing `SpeechService` lifecycle events, recording only bounded state metadata through `performanceTracker`.
- `package.json` test gate appended to the existing `test:all` sequence.

The observer does not transmit or persist PCM, transcript, prompt, response, or arbitrary error payloads. Existing speech commands, Renderer capture, UI broadcasts, VAD, Whisper, and LLM dispatch remain outside the new state-machine contract.

## Validation limits

The following were not validated by this baseline:

- Windows 10/11 microphone and system-loopback device matrix
- Real browser `getDisplayMedia()` or `desktopCapturer` capture
- SYSTEM audio track delivery or video-track cleanup
- AudioWorklet/MessagePort behavior with real devices
- Utility Process, DSP, VAD, segmentation, overlap, or Dual STT behavior
- Main/Renderer performance or memory benchmark
- 10/30/60-minute sessions or synthetic 100/1,000/5,000-segment loads
- Production packaging/build and installed-artifact behavior

The legacy pipeline remains the only functional audio pipeline covered here. Rollback for this increment is limited to removing the observational state-machine integration and its test/docs additions; no user-state migration is required.
