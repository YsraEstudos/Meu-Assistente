# Continuous integration

The repository uses `.github/workflows/ci.yml` as the pull-request CI gate.
The workflow is intentionally separate from the release workflow so that PR
code never receives the release workflow's `contents: write` permission.

## What the CI validates

- portable speech, security, audio-session, review-fix, and audio-meter tests;
- deterministic tests added by the stacked feature PRs when their files are
  present;
- Linux and Windows packaging with publishing and code signing disabled.

GPU, latency, benchmark, microphone, live Whisper, and other hardware-bound
checks remain manual or trusted-environment checks. They are not suitable as
hosted pull-request gates because the GitHub runners do not provide the
project's local GPU, Whisper model, or audio devices.

## Repository settings required after the first CI run

Configure a protection rule or ruleset for `main` with:

1. require a pull request before merging;
2. require at least one human approval;
3. require the `CI / test` and `CI / build` status checks;
4. require the branch to be up to date before merging;
5. dismiss stale approvals or require approval of the latest reviewable push;
6. require conversation resolution;
7. prevent force pushes and branch deletion;
8. do not allow bypasses unless there is an explicit recovery procedure.

The check names are deliberately stable gate jobs. The matrix jobs provide
platform coverage, while the gate jobs convert any failed, cancelled, or
skipped matrix result into a failed required check.

The workflow runs on every pull request target rather than filtering only
`main`, so stacked PRs targeting intermediate integration branches also get a
portable validation run. If those intermediate branches are merge targets,
they must also be covered by repository rules or treated as non-protected
temporary branches that are never merged without the checks.

## Security rules

- Keep PR validation on `pull_request`; do not change it to
  `pull_request_target` while executing checked-out PR code.
- Keep repository permissions read-only and do not provide secrets to the PR
  jobs.
- Keep release publishing in `release.yml`, which is triggered only for tags
  or an explicitly approved manual run.
- Review changes to `.github/workflows/**`, `package.json`, and
  `package-lock.json` with special care.
- Keep action references pinned to immutable commit SHAs and update them in a
  deliberate dependency-maintenance change.

## Current limitations

`npm audit --audit-level=high` currently reports vulnerabilities in the base
dependency tree, including a critical finding. It should become a separate,
explicit dependency-security gate after the baseline is remediated or an
approved, time-bounded exception is recorded; it is not silently folded into
the initial CI gate.
