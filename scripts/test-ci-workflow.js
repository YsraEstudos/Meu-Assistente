'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const workflowPath = path.join(__dirname, '..', '.github', 'workflows', 'ci.yml');
const workflow = fs.readFileSync(workflowPath, 'utf8');

assert.match(workflow, /^name:\s+CI\s*$/m, 'CI workflow must have a stable name');
assert.match(workflow, /^  pull_request:\s*$/m, 'CI must run for pull requests');
assert.match(workflow, /^  merge_group:\s*$/m, 'CI must support a future merge queue');
assert.match(workflow, /^  push:\s*$/m, 'CI must run after changes reach main');
assert.match(workflow, /^    branches:\s*\r?\n      - main\s*$/m, 'push CI must be limited to main');
assert.match(workflow, /^permissions:\s*\r?\n  contents:\s+read\s*$/m, 'PR CI must have read-only repository permissions');
assert.match(workflow, /^concurrency:\s*$/m, 'CI must cancel obsolete runs');
assert.match(workflow, /cancel-in-progress:\s+true/, 'CI must cancel obsolete runs');
assert.match(workflow, /timeout-minutes:\s+\d+/, 'CI jobs must have time limits');
assert.match(workflow, /persist-credentials:\s+false/, 'checkout must not persist credentials');
assert.match(workflow, /os:\s+\[ubuntu-latest, windows-latest\]/, 'tests must cover Linux and Windows');
assert.match(workflow, /target:\s+linux/, 'build must cover Linux packaging');
assert.match(workflow, /target:\s+win/, 'build must cover Windows packaging');
assert.match(workflow, /--\$\{\{ matrix\.target \}\} --publish never/, 'build must not publish artifacts');
assert.match(workflow, /CSC_IDENTITY_AUTO_DISCOVERY:\s+'false'/, 'CI build must not sign artifacts');
assert.doesNotMatch(workflow, /pull_request_target/i, 'PR tests must not use pull_request_target');
assert.doesNotMatch(workflow, /contents:\s+write/i, 'PR CI must not request write permissions');
assert.doesNotMatch(workflow, /\$\{\{\s*secrets\./i, 'PR CI must not expose repository secrets');

const actionLines = workflow
  .split(/\r?\n/)
  .filter((line) => /^\s+uses:\s+/.test(line));
assert(actionLines.length > 0, 'CI must use explicit, auditable actions');
for (const line of actionLines) {
  assert.match(line, /@[0-9a-f]{40}(?:\s|$)/i, `action must be pinned to a commit SHA: ${line.trim()}`);
}

const requiredTests = [
  'scripts/test-ci-workflow.js',
  'scripts/test-speech-finalization.js',
  'scripts/test-security-boundaries.js',
  'scripts/test-audio-session.js',
  'scripts/test-pr-review-fixes.js',
  'scripts/test-audio-meter.js'
];
for (const testPath of requiredTests) {
  assert(workflow.includes(testPath), `portable CI must execute ${testPath}`);
}

const stackedPortableTests = [
  'scripts/test-audio-runtime.js',
  'scripts/test-transcription-context.js',
  'scripts/test-ui-config.js',
  'scripts/test-repository-docs.js',
  'scripts/test-speech-latency.js',
  'scripts/test-benchmark-transcription.js'
];
for (const testPath of stackedPortableTests) {
  assert(workflow.includes(testPath), `stacked PR CI must detect ${testPath} when present`);
}
assert.match(workflow, /for test_file in "\$\{optional_tests\[@\]\}"/, 'stacked tests must be executed when present');
assert.match(workflow, /if \[\[ -f "\$test_file" \]\]/, 'optional tests must be presence-checked before execution');

assert(workflow.includes('test-gpu-regression.js') === false, 'hardware GPU regression must not be a hosted PR gate');
assert(workflow.includes('npm ci'), 'CI must install from the lockfile with npm ci');
assert(workflow.includes('electron-builder'), 'CI must validate the packaged build');
assert.match(workflow, /if:\s+\$\{\{\s*always\(\)\s*\}\}/, 'gate jobs must always report matrix failures');
assert.match(workflow, /needs\.test-matrix\.result.*success/, 'test gate must reject non-success matrix results');
assert.match(workflow, /needs\.build-matrix\.result.*success/, 'build gate must reject non-success matrix results');

console.log('CI workflow contract tests: passed');
