/**
 * Whisper detection and install helpers.
 *
 * Used by the onboarding wizard to:
 *   - Probe whether the Whisper CLI is on PATH (or in a project-local venv)
 *   - Run a real install into a project-local venv (no sudo, no PEP 668)
 *   - Stream live progress so the wizard can paint install output
 *
 * Why a venv on every platform:
 *   - Windows: avoids needing admin rights to install into system Python
 *   - Linux (PEP 668): pip refuses to install into externally-managed
 *     environments on Ubuntu 23.04+, Debian 12+, Fedora 38+, etc.
 *   - macOS: keeps system Python untouched; respects Homebrew isolation
 *
 * All shell calls are timeouts-bounded and stream stdout/stderr live
 * via the optional `onProgress` callback so the UI can show real-time
 * install output instead of a frozen spinner.
 */

const { execFile, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const PROBE_TIMEOUT_MS = 30000; // first `import whisper` (torch) is slow on a cold cache
const INSTALL_TIMEOUT_MS = 300000; // pip downloads can be slow on cold cache

function buildChildEnv(extra = {}) {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    const upper = String(key).toUpperCase();
    if (upper === 'GEMINI_API_KEY' || upper === 'AZURE_SPEECH_KEY' || upper === 'AZURE_SPEECH_REGION') continue;
    if (upper.includes('TOKEN') || upper.includes('SECRET')) continue;
    env[key] = value;
  }
  return { ...env, ...extra };
}

/**
 * Run a command, streaming stdout/stderr lines to `onProgress` as they
 * arrive. Resolves with the full result once the process exits.
 */
function runExec(cmd, args, { timeout = PROBE_TIMEOUT_MS, onProgress } = {}) {
  const log = (line) => {
    if (typeof onProgress === 'function' && line) {
      try { onProgress(line); } catch (_) { /* swallow handler errors */ }
    }
  };

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    // Use `spawn` (not `execFile`) so we can stream stdout/stderr line
    // by line instead of buffering the entire pip run.
    let child;
    try {
      child = spawn(cmd, args, {
        windowsHide: true,
        env: buildChildEnv({ PYTHONIOENCODING: 'utf-8', PYTHONUNBUFFERED: '1' }),
      });
    } catch (e) {
      finish({ ok: false, error: e.message, stderr: e.message, stdout: '', code: null });
      return;
    }

    let stdoutBuf = '';
    let stderrBuf = '';

    const handleChunk = (buf, isErr) => {
      buf.data += buf.chunk;
      const lines = buf.data.split(/\r?\n/);
      buf.data = lines.pop() ?? '';
      for (const line of lines) {
        if (line.length === 0) continue;
        if (isErr) stderrBuf += (stderrBuf ? '\n' : '') + line;
        else stdoutBuf += (stdoutBuf ? '\n' : '') + line;
        log(line);
      }
    };

    const outBuf = { data: '', chunk: '' };
    const errBuf = { data: '', chunk: '' };
    child.stdout.on('data', (chunk) => { outBuf.chunk = chunk.toString('utf8'); handleChunk(outBuf, false); });
    child.stderr.on('data', (chunk) => { errBuf.chunk = chunk.toString('utf8'); handleChunk(errBuf, true); });

    const killTimer = setTimeout(() => {
      log(`! Command timed out after ${timeout}ms — killing`);
      try { child.kill('SIGKILL'); } catch (_) { /* ignore */ }
      finish({
        ok: false,
        timeout: true,
        stdout: stdoutBuf,
        stderr: (stderrBuf + (stderrBuf ? '\n' : '') + 'Timed out').trim(),
        error: `Timeout after ${timeout}ms: ${cmd} ${args.join(' ')}`,
        code: null,
      });
    }, timeout);

    child.on('error', (err) => {
      clearTimeout(killTimer);
      log(`! Spawn error: ${err.message}`);
      finish({
        ok: false,
        stdout: stdoutBuf,
        stderr: stderrBuf || err.message,
        error: err.message,
        code: err.code ?? null,
      });
    });

    child.on('close', (code, signal) => {
      clearTimeout(killTimer);
      // Flush any trailing partial line
      if (outBuf.data) { stdoutBuf += (stdoutBuf ? '\n' : '') + outBuf.data; log(outBuf.data); }
      if (errBuf.data) { stderrBuf += (stderrBuf ? '\n' : '') + errBuf.data; log(errBuf.data); }

      if (code === 0) {
        finish({ ok: true, code, stdout: stdoutBuf, stderr: stderrBuf });
      } else {
        finish({
          ok: false,
          code,
          signal,
          stdout: stdoutBuf,
          stderr: stderrBuf,
          error: `Exited with code ${code}${signal ? ` (signal ${signal})` : ''}`,
        });
      }
    });
  });
}

class WhisperInstaller {
  constructor(options = {}) {
    this.cwd = options.cwd || process.cwd();
    // Persistent data directory for the virtual environment. In packaged
    // builds process.cwd() is not stable (AppImage mount dirs change,
    // system install dirs may be read-only), so we default to userData.
    this.dataDir = options.dataDir || this.cwd;
    this.platform = options.platform || process.platform;
    const requestedEngine = String(options.engine || process.env.WHISPER_ENGINE || 'openai').trim().toLowerCase();
    this.engine = ['cpp', 'whisper.cpp', 'whispercpp', 'whisper-cpp'].includes(requestedEngine)
      ? 'whisper-cpp'
      : (requestedEngine === 'faster' ? 'faster' : 'openai');
    this.runExec = options.runExec || runExec;
  }

  // ─────────────────────────────────────────────────────────────────
  // Paths
  // ─────────────────────────────────────────────────────────────────

  get venvPath() {
    if (this.engine === 'faster') return path.join(this.dataDir, '.venv-faster-whisper');
    if (this.engine === 'whisper-cpp') return path.join(this.dataDir, '.venv-whisper-cpp');
    return path.join(this.dataDir, '.venv-whisper');
  }

  /**
   * Stable, absolute directory for downloaded model weights. Lives alongside
   * the venv under the persistent data dir (userData in packaged builds) so
   * the download location and the transcription `--model_dir` always agree.
   * A relative WHISPER_MODEL_DIR resolved against an unstable cwd was the
   * cause of models being "downloaded" but not found at transcribe time.
   */
  get modelDir() {
    if (this.engine === 'faster') return path.join(this.dataDir, '.faster-whisper-models');
    if (this.engine === 'whisper-cpp') return path.join(this.dataDir, '.whisper-cpp-models');
    return path.join(this.dataDir, '.whisper-models');
  }

  /**
   * Inside the venv:
   *   - macOS/Linux: bin/whisper, bin/python, bin/pip
   *   - Windows:     Scripts\whisper.exe, Scripts\python.exe, Scripts\pip.exe
   */
  get venvPaths() {
    const bin = this.platform === 'win32' ? 'Scripts' : 'bin';
    const ext = this.platform === 'win32' ? '.exe' : '';
    const dir = path.join(this.venvPath, bin);
    return {
      dir,
      python: path.join(dir, `python${ext}`),
      pip: path.join(dir, `pip${ext}`),
      whisper: path.join(dir, `whisper${ext}`),
    };
  }

  // ─────────────────────────────────────────────────────────────────
  // Detection
  // ─────────────────────────────────────────────────────────────────

  async detect() {
    if (this.engine === 'whisper-cpp') return this._detectWhisperCpp();
    if (this.engine === 'faster') return this._detectFaster();
    // 1. Honor WHISPER_COMMAND env if user has it set already
    const fromEnv = (process.env.WHISPER_COMMAND || '').trim();
    if (fromEnv) {
      const parsed = this._parseCommandString(fromEnv);
      if (parsed && parsed.length > 0) {
        // eslint-disable-next-line no-await-in-loop
        const probe = await this._probe(parsed);
        if (probe.ok) {
          return {
            found: true,
            command: fromEnv,
            version: probe.version,
            source: 'env',
          };
        }
      }
    }

    // 2. Probe a list of likely candidates
    const candidates = this._candidateCommands();
    for (const candidate of candidates) {
      // eslint-disable-next-line no-await-in-loop
      const probe = await this._probe(candidate);
      if (probe.ok) {
        const joined = candidate.join(' ');
        return {
          found: true,
          command: joined.includes(' ') && !joined.startsWith('"')
            ? `"${candidate[0]}" ${candidate.slice(1).join(' ')}`
            : joined,
          version: probe.version,
          source: 'probe',
        };
      }
    }

    return { found: false, command: null, version: null, source: 'none' };
  }

  // ─────────────────────────────────────────────────────────────────
  // Install
  // ─────────────────────────────────────────────────────────────────

  /**
   * Install whisper into a project-local venv. Works on every platform
   * without admin rights and without hitting PEP 668.
   *
   * Steps:
   *   1. Find Python on the system (py / python3 / python)
   *   2. Create .venv-whisper/ if missing
   *   3. pip install openai-whisper into it (live progress)
   *   4. Verify the resulting whisper CLI works
   *
   * @param {object} options
   * @param {(line: string) => void} [options.onProgress] Live output
   * @returns {Promise<{ok: boolean, command: string|null, message: string, logs: string}>}
   */
  async install({ onProgress } = {}) {
    if (this.engine === 'whisper-cpp') return this._installWhisperCpp({ onProgress });
    if (this.engine === 'faster') return this._installFaster({ onProgress });
    const log = (line) => {
      if (typeof onProgress === 'function') onProgress(line);
    };

    log('→ Detecting Python on the system…');
    const python = this._detectPython();
    if (!python) {
      const msg = this.platform === 'win32'
        ? 'Python 3.10+ not found. Install from python.org and make sure "Add Python to PATH" is checked.'
        : 'python3 not found. Install with your package manager (e.g. `sudo apt install python3 python3-venv`).';
      log(`! ${msg}`);
      return { ok: false, command: null, message: msg, logs: msg };
    }
    log(`✓ Found Python: ${python}`);

    // openai-whisper requires Python 3.9+ (3.10+ recommended for best
    // performance). Catch version mismatch BEFORE attempting pip
    // install — the pip error is cryptic and confusing.
    const version = await this._getPythonVersion(python);
    if (!version) {
      log('! Could not determine Python version');
      return { ok: false, command: null, message: 'Could not determine Python version', logs: '' };
    }
    log(`→ Python version: ${version}`);
    if (!this._isPythonVersionOk(version)) {
      const msg = `Python ${version} is too old. openai-whisper requires Python 3.9 or newer. Please upgrade Python and retry.`;
      log(`! ${msg}`);
      return { ok: false, command: null, message: msg, logs: msg };
    }
    log('✓ Python version OK');

    const vp = this.venvPaths;
    const venvExists = fs.existsSync(vp.python);

    // Step 2: create venv if needed
    if (!venvExists) {
      // Preflight: on Debian/Ubuntu (and minimal systems / AppImage hosts)
      // python3 exists but the stdlib `venv`/`ensurepip` modules ship
      // separately as python3-venv. Detect this explicitly so the user gets an
      // actionable apt hint instead of a cryptic "ensurepip is not available".
      const preflight = await this.runExec(python, ['-c', 'import ensurepip, venv'], {
        timeout: 15000,
      });
      if (!preflight.ok) {
        const msg = this.platform === 'linux'
          ? 'Python is missing the venv module. Install it with `sudo apt install python3-venv` (or your distro\'s equivalent) and retry.'
          : 'Python is missing the venv/ensurepip module. Reinstall Python (python.org) with the standard library included and retry.';
        log(`! ${msg}`);
        return { ok: false, command: null, message: msg, logs: preflight.stderr || msg };
      }

      log(`→ Creating venv at ${this.venvPath}…`);
      const venvResult = await this.runExec(python, ['-m', 'venv', this.venvPath], {
        timeout: 60000,
        onProgress: log,
      });
      if (!venvResult.ok) {
        const msg = `Failed to create venv: ${venvResult.stderr || venvResult.error}`;
        log(`! ${msg}`);
        return { ok: false, command: null, message: msg, logs: venvResult.stdout + '\n' + venvResult.stderr };
      }
      log('✓ Venv created');
    } else {
      log(`✓ Venv already exists at ${this.venvPath}`);
    }

    // Confirm the venv's python actually exists now (venv creation can
    // partially fail on Windows without admin rights to symlink).
    if (!fs.existsSync(vp.python)) {
      const msg = `Venv created but ${vp.python} is missing. Try deleting ${this.venvPath} and retrying.`;
      log(`! ${msg}`);
      return { ok: false, command: null, message: msg, logs: msg };
    }

    // Step 3: pip install into the venv
    log(`→ Installing openai-whisper into venv (this can take a few minutes)…`);
    const pipResult = await this.runExec(vp.python, ['-m', 'pip', 'install', '--upgrade', 'openai-whisper==20240930'], {
      timeout: INSTALL_TIMEOUT_MS,
      onProgress: log,
    });
    if (!pipResult.ok) {
      const msg = `pip install failed: ${pipResult.stderr || pipResult.error}`;
      log(`! ${msg}`);
      return { ok: false, command: null, message: msg, logs: pipResult.stdout + '\n' + pipResult.stderr };
    }
    log('✓ openai-whisper installed');

    // Step 4: verify the resulting CLI
    log(`→ Verifying whisper CLI at ${vp.whisper}…`);
    if (!fs.existsSync(vp.whisper)) {
      const msg = `Install reported success but ${vp.whisper} was not created. Check your pip output above.`;
      log(`! ${msg}`);
      return { ok: false, command: null, message: msg, logs: msg };
    }

    const verify = await this._probe([vp.whisper]);
    if (!verify.ok) {
      const msg = `whisper binary exists but doesn't respond to --help. It may be corrupted.`;
      log(`! ${msg}`);
      return { ok: false, command: null, message: msg, logs: msg };
    }

    // Check for ffmpeg — whisper needs it for any non-WAV audio.
    // We log a warning but don't fail; user can install it later.
    const ffmpeg = await this._probeFfmpeg();
    if (ffmpeg.found) {
      log(`✓ ffmpeg detected (${ffmpeg.path})`);
    } else {
      const ffmpegMsg = this.platform === 'win32'
        ? 'ffmpeg not found — optional for OpenCluely (we always pass WAV audio to Whisper). Install later with `winget install ffmpeg` only if you need other formats.'
        : this.platform === 'darwin'
          ? 'ffmpeg not found — optional for OpenCluely (we always pass WAV audio to Whisper). Install later with `brew install ffmpeg` only if you need other formats.'
          : 'ffmpeg not found — optional for OpenCluely (we always pass WAV audio to Whisper). Install later with `sudo apt install ffmpeg` only if you need other formats.';
      log(`! ${ffmpegMsg}`);
    }

    // Quote the python path if it contains spaces (common on Windows
    // user profiles like "C:\Users\CANDAN SINGH\...").
    const pythonPath = vp.python.includes(' ') ? `"${vp.python}"` : vp.python;
    const commandStr = `${pythonPath} -m whisper`;
    log(`✓ Whisper CLI ready: ${commandStr} (v${verify.version || '?'})`);

    return {
      ok: true,
      command: commandStr,
      message: `Installed Whisper v${verify.version || '?'} into ${this.venvPath}`,
      logs: pipResult.stdout,
      ffmpegDetected: ffmpeg.found,
    };
  }

  async _detectWhisperCpp() {
    const binary = this._findWhisperCppBinary();
    const base = {
      found: false,
      command: null,
      version: null,
      source: 'none',
      engine: 'whisper-cpp',
      available: false,
      backend: process.env.WHISPER_CPP_BACKEND || 'vulkan'
    };
    if (!binary) return base;
    const probe = await this.runExec(binary, ['--help'], { timeout: 15000 });
    if (!probe.ok) return { ...base, command: binary, source: 'probe' };
    const versionMatch = ((probe.stdout || '') + '\n' + (probe.stderr || '')).match(/whisper\.cpp[^\d]*(\d+(?:\.\d+)+)/i);
    return { ...base, found: true, available: true, command: binary, version: versionMatch ? versionMatch[1] : null, source: process.env.WHISPER_CPP_COMMAND ? 'env' : 'probe' };
  }

  async _detectFaster() {
    const vp = this.venvPaths;
    const device = process.env.WHISPER_FASTER_DEVICE || 'cpu';
    const computeType = process.env.WHISPER_FASTER_COMPUTE_TYPE || 'int8';
    if (!fs.existsSync(vp.python)) return { found: false, command: null, version: null, source: 'none', engine: 'faster', available: false, device, computeType };
    const probe = await this.runExec(vp.python, ['-c', 'import faster_whisper; print("ok")'], { timeout: 15000 });
    return { found: probe.ok, command: probe.ok ? vp.python : null, version: probe.ok ? 'faster-whisper' : null, source: 'venv', engine: 'faster', available: probe.ok, device, computeType };
  }

  async _installFaster({ onProgress } = {}) {
    const log = (line) => { if (typeof onProgress === 'function' && line) onProgress(line); };
    const python = this._detectPython();
    if (!python) return { ok: false, command: null, message: 'Python 3 not found for Faster Whisper.', logs: '' };
    const vp = this.venvPaths;
    if (!fs.existsSync(vp.python)) {
      const preflight = await this.runExec(python, ['-c', 'import ensurepip, venv'], { timeout: 15000 });
      if (!preflight.ok) return { ok: false, command: null, message: 'Python is missing the venv/ensurepip module.', logs: preflight.stderr || '' };
      log('→ Creating Faster Whisper venv at ' + this.venvPath + '…');
      const venvResult = await this.runExec(python, ['-m', 'venv', this.venvPath], { timeout: 60000, onProgress: log });
      if (!venvResult.ok) return { ok: false, command: null, message: 'Failed to create Faster Whisper venv: ' + (venvResult.stderr || venvResult.error), logs: venvResult.stderr || '' };
    }
    const gpu = await this._detectGpu(python, log);
    let device = 'cpu';
    let computeType = 'int8';
    if (gpu.device === 'cuda') {
      device = 'cuda';
      computeType = 'float16';
      log('NVIDIA GPU detected: ' + (gpu.gpuName || 'NVIDIA GPU') + '. Installing CUDA support…');
    } else if (gpu.vulkan && gpu.vulkanGpuName) {
      log('AMD/other GPU detected through Vulkan, but Faster Whisper will use safe CPU int8.');
    } else {
      log('No Faster Whisper GPU runtime detected. Using device=cpu, compute_type=int8.');
    }
    const pipResult = await this.runExec(vp.python, ['-m', 'pip', 'install', 'pip==24.3.1', 'faster-whisper==1.0.3'], { timeout: INSTALL_TIMEOUT_MS, onProgress: log });
    if (!pipResult.ok) return { ok: false, command: null, message: 'pip install failed: ' + (pipResult.stderr || pipResult.error), logs: pipResult.stderr || '' };
    let supportLogs = '';
    if (device === 'cuda') {
      // Review these CUDA pins when updating support.
      const cudaResult = await this.runExec(vp.python, ['-m', 'pip', 'install', 'nvidia-cublas-cu12==12.1.3.1', 'nvidia-cudnn-cu12==9.1.0.70'], { timeout: INSTALL_TIMEOUT_MS, onProgress: log });
      supportLogs = cudaResult.stdout || '';
      if (!cudaResult.ok) log('! CUDA runtime packages could not be installed: ' + (cudaResult.stderr || cudaResult.error));
    }
    return { ok: true, command: vp.python + ' -m scripts.faster-whisper-worker', message: 'Installed Faster Whisper into ' + this.venvPath, logs: [pipResult.stdout, supportLogs].filter(Boolean).join('\n'), engine: 'faster', modelDir: this.modelDir, device, computeType, gpuName: gpu.gpuName || gpu.vulkanGpuName || '' };
  }

  _getScriptPath(filename) {
    const candidates = [];
    if (process.resourcesPath) candidates.push(path.join(process.resourcesPath, 'app.asar.unpacked', 'scripts', filename));
    candidates.push(path.resolve(__dirname, '..', '..', 'scripts', filename));
    candidates.push(path.join(this.cwd, 'scripts', filename));
    return candidates.find((candidate) => fs.existsSync(candidate)) || null;
  }

  async _detectGpu(python, log) {
    const fallback = { device: 'cpu', cuda: false, rocm: false, gpuName: '', vulkan: false, vulkanGpuName: '' };
    const scriptPath = this._getScriptPath('detect-gpu.py');
    if (!scriptPath) return fallback;
    const result = await this.runExec(python, [scriptPath], { timeout: 10000 });
    if (!result.ok) {
      if (typeof log === 'function') log('! GPU detection failed; continuing with CPU fallback.');
      return fallback;
    }
    try {
      const payload = JSON.parse(String(result.stdout || '').trim());
      const device = ['cuda', 'rocm', 'cpu'].includes(payload.device) ? payload.device : 'cpu';
      return { device, cuda: device === 'cuda', rocm: device === 'rocm', gpuName: String(payload.gpuName || ''), vulkan: payload.vulkan === true, vulkanGpuName: String(payload.vulkanGpuName || '') };
    } catch (_) {
      if (typeof log === 'function') log('! GPU detection returned invalid JSON; continuing with CPU fallback.');
      return fallback;
    }
  }

  async _detectCpu(python, log) {
    const fallback = { vendor: 'unknown', cpuName: '', has_avx2: false, has_avx512: false, blas_available: false, openblas_version: null, logical_cpus: 1, platform: this.platform };
    const scriptPath = this._getScriptPath('detect-cpu.py');
    if (!scriptPath) return fallback;
    const result = await this.runExec(python, [scriptPath], { timeout: 10000 });
    if (!result.ok) {
      if (typeof log === 'function') log('! CPU detection failed; continuing without CPU hints.');
      return fallback;
    }
    try {
      return { ...fallback, ...JSON.parse(String(result.stdout || '').trim()) };
    } catch (_) {
      if (typeof log === 'function') log('! CPU detection returned invalid JSON; continuing without CPU hints.');
      return fallback;
    }
  }

  _resolveTool(command) {
    if (!command) return null;
    if (path.isAbsolute(command) && fs.existsSync(command)) return command;
    try {
      const locator = this.platform === 'win32' ? 'where' : 'which';
      const result = require('child_process').spawnSync(locator, [command], { encoding: 'utf8', windowsHide: true });
      if (result.status === 0) return String(result.stdout || '').split(/\r?\n/).map((line) => line.trim()).find(Boolean) || command;
    } catch (_) { /* ignore */ }
    return null;
  }

  _findWhisperCppBinary() {
    const configured = (process.env.WHISPER_CPP_COMMAND || '').trim();
    if (configured) {
      const parsed = this._parseCommandString(configured);
      if (parsed && parsed[0]) {
        if (fs.existsSync(parsed[0])) return parsed[0];
        const resolved = this._resolveTool(parsed[0]);
        if (resolved) return resolved;
      }
    }
    const extension = this.platform === 'win32' ? '.exe' : '';
    const roots = [path.join(this.dataDir, '.whisper.cpp'), path.join(this.cwd, '.whisper.cpp'), path.join(this.cwd, 'whisper.cpp')];
    const candidates = [];
    for (const root of roots) {
      candidates.push(path.join(root, 'build', 'bin', 'whisper-cli' + extension), path.join(root, 'build', 'bin', 'Release', 'whisper-cli' + extension), path.join(root, 'build', 'Release', 'whisper-cli' + extension), path.join(root, 'build', 'bin', 'main' + extension), path.join(root, 'build', 'bin', 'Release', 'main' + extension));
    }
    for (const candidate of candidates) if (fs.existsSync(candidate)) return candidate;
    for (const command of this.platform === 'win32' ? ['whisper-cli.exe', 'whisper-cli', 'main.exe', 'main'] : ['whisper-cli', 'main']) {
      const resolved = this._resolveTool(command);
      if (resolved) return resolved;
    }
    return null;
  }

  async _installWhisperCpp({ onProgress } = {}) {
    const log = (line) => { if (typeof onProgress === 'function' && line) onProgress(line); };
    const python = this._detectPython();
    if (!python) return { ok: false, command: null, message: 'Python 3 is required for whisper.cpp.', logs: '' };
    log('→ Detecting CPU and Vulkan capabilities…');
    const cpu = await this._detectCpu(python, log);
    const gpu = await this._detectGpu(python, log);
    const threads = Math.max(1, Math.min(32, Number(cpu.logical_cpus) || 4));
    const vulkanEnabled = gpu.vulkan === true;
    log('✓ CPU: ' + (cpu.cpuName || cpu.vendor || 'unknown') + ' (' + threads + ' logical CPUs)');
    if (vulkanEnabled) log('✓ Vulkan GPU: ' + (gpu.vulkanGpuName || gpu.gpuName || 'GPU') + ' — enabling Vulkan');
    else log('→ Vulkan runtime unavailable — building CPU fallback');

    const vp = this.venvPaths;
    if (!fs.existsSync(vp.python)) {
      const preflight = await this.runExec(python, ['-c', 'import ensurepip, venv'], { timeout: 15000 });
      if (!preflight.ok) return { ok: false, command: null, message: 'Python is missing the venv/ensurepip module.', logs: preflight.stderr || '' };
      log('→ Creating whisper.cpp worker venv at ' + this.venvPath + '…');
      const venvResult = await this.runExec(python, ['-m', 'venv', this.venvPath], { timeout: 60000, onProgress: log });
      if (!venvResult.ok) return { ok: false, command: null, message: 'Failed to create whisper.cpp worker venv: ' + (venvResult.stderr || venvResult.error), logs: venvResult.stderr || '' };
    }

    let binary = this._findWhisperCppBinary();
    let buildLogs = '';
    if (!binary) {
      const git = this._resolveTool('git');
      const cmake = this._resolveTool('cmake');
      if (!git || !cmake) return { ok: false, command: null, message: 'whisper.cpp not found. Install Git and CMake or set WHISPER_CPP_COMMAND.', logs: '' };
      const sourceDir = path.join(this.dataDir, '.whisper.cpp');
      if (!fs.existsSync(path.join(sourceDir, 'CMakeLists.txt'))) {
        log('→ Cloning whisper.cpp v1.9.1…');
        // Integrity is provided by the pinned v1.9.1 branch/tag selection.
        const clone = await this.runExec(git, ['clone', '--branch', 'v1.9.1', '--depth', '1', 'https://github.com/ggml-org/whisper.cpp.git', sourceDir], { timeout: 600000, onProgress: log });
        buildLogs += clone.stdout || '';
        if (!clone.ok) return { ok: false, command: null, message: 'Failed to clone whisper.cpp: ' + (clone.stderr || clone.error), logs: buildLogs };
      }
      const buildDir = path.join(sourceDir, 'build');
      const configureArgs = ['-S', sourceDir, '-B', buildDir, '-DCMAKE_BUILD_TYPE=Release', '-DGGML_VULKAN=' + (vulkanEnabled ? 'ON' : 'OFF')];
      if (cpu.blas_available) configureArgs.push('-DGGML_BLAS=ON', '-DGGML_BLAS_VENDOR=OpenBLAS');
      log('→ Configuring whisper.cpp with ' + (vulkanEnabled ? 'Vulkan' : 'native CPU kernels') + '…');
      const configure = await this.runExec(cmake, configureArgs, { timeout: 600000, onProgress: log });
      buildLogs += configure.stdout || '';
      if (!configure.ok) return { ok: false, command: null, message: 'CMake configuration failed: ' + (configure.stderr || configure.error), logs: buildLogs };
      const build = await this.runExec(cmake, ['--build', buildDir, '--config', 'Release'], { timeout: 900000, onProgress: log });
      buildLogs += build.stdout || '';
      if (!build.ok) return { ok: false, command: null, message: 'whisper.cpp build failed: ' + (build.stderr || build.error), logs: buildLogs };
      binary = this._findWhisperCppBinary();
    }
    if (!binary) return { ok: false, command: null, message: 'whisper-cli was not found after the build.', logs: buildLogs };
    try { fs.mkdirSync(this.modelDir, { recursive: true }); } catch (_) { /* best effort */ }
    return { ok: true, command: binary, binary, python: vp.python, engine: 'whisper-cpp', modelDir: this.modelDir, threads, blas: !!cpu.blas_available, backend: vulkanEnabled ? 'vulkan' : 'cpu', vulkan: vulkanEnabled, gpuName: gpu.vulkanGpuName || gpu.gpuName || '', message: 'Installed whisper.cpp v1.9.1 into ' + this.dataDir, logs: buildLogs };
  }

  _normaliseWhisperCppModelName(modelName) {
    const sanitized = this._sanitizeModelName(modelName);
    if (!sanitized) throw new Error('Invalid model name: ' + modelName);
    const raw = sanitized.replace(/^ggml-/, '').replace(/\.(bin|pt)$/, '');
    return { turbo: 'large-v3-turbo', large: 'large-v3' }[raw] || raw;
  }

  _sanitizeModelName(raw) {
    const value = String(raw ?? '').trim().toLowerCase().replace(/^ggml-/, '').replace(/\.(bin|pt)$/, '');
    if (!value || value.length > 64) return null;
    if (value.includes('/') || value.includes('\\') || value.includes('..') || /\s/.test(value)) return null;
    if (!/^[a-z0-9._-]+$/.test(value)) return null;
    return value;
  }

  async _downloadWhisperCppModel(modelName, { onProgress } = {}) {
    const log = (line) => { if (typeof onProgress === 'function' && line) onProgress(line); };
    const python = this._detectPython();
    if (!python) return { ok: false, message: 'Python 3 is required to download whisper.cpp models.', path: null };
    const sanitized = this._sanitizeModelName(modelName);
    if (!sanitized) return { ok: false, message: 'Invalid model name: ' + modelName, path: null };
    const modelPath = this._getModelPath(sanitized);
    if (fs.existsSync(modelPath)) return { ok: true, message: 'Model already exists', path: modelPath };
    try { fs.mkdirSync(this.modelDir, { recursive: true }); } catch (_) { /* best effort */ }
    const key = this._normaliseWhisperCppModelName(sanitized);
    const url = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-' + key + '.bin';
    log('→ Downloading whisper.cpp ' + modelName + ' model…');
    const script = 'import urllib.request; urllib.request.urlretrieve(' + JSON.stringify(url) + ', ' + JSON.stringify(modelPath) + '); print("model_downloaded")';
    const result = await this.runExec(python, ['-c', script], { timeout: 900000, onProgress: log });
    const stat = result.ok && fs.existsSync(modelPath) ? fs.statSync(modelPath) : null;
    if (!result.ok || !stat || stat.size <= 0) return { ok: false, message: 'Model download failed: ' + (result.stderr || result.error), path: null };
    return { ok: true, message: 'Model downloaded successfully', path: modelPath };
  }

  /**
   * Probe for ffmpeg on PATH. Returns { found, path }.
   */
  async _probeFfmpeg() {
    try {
      const { spawnSync } = require('child_process');
      const r = spawnSync(
        this.platform === 'win32' ? 'where' : 'which',
        ['ffmpeg'],
        { windowsHide: true },
      );
      if (r.status === 0) {
        const path = (r.stdout || '').toString().split(/\r?\n/)[0].trim();
        return { found: true, path };
      }
    } catch (_) { /* ignore */ }
    return { found: false, path: null };
  }

  /**
   * Short platform-tailored hints to show the user in the wizard.
   */
  installHints() {
    if (this.engine === 'whisper-cpp') {
      return {
        title: 'whisper.cpp v1.9.1 com Vulkan para GPU AMD',
        steps: [
          'Detecta a Radeon pelo runtime Vulkan antes da compilação.',
          'Compila whisper.cpp v1.9.1 com GGML_VULKAN=ON quando o Vulkan SDK está disponível.',
          'Executa whisper-cli como processo separado e confirma o backend no diagnóstico.',
          'Se Vulkan ou o modelo falhar, usa Faster Whisper CPU int8 como fallback.',
        ],
      };
    }
    if (this.engine === 'faster') {
      return {
        title: 'Faster Whisper em venv isolado',
        steps: [
          'Usa CUDA somente quando nvidia-smi confirmar uma GPU NVIDIA.',
          'Para AMD sem ROCm suportado, mantém CPU int8.',
          'O worker fica isolado em .venv-faster-whisper.',
        ],
      };
    }
    switch (this.platform) {
      case 'win32':
        return {
          title: 'Install via a project-local Python venv',
          steps: [
            'Python 3.10+ must be on PATH (download from python.org if missing).',
            "We'll create <code>.venv-whisper\\</code> in the app directory — no admin needed.",
            'openai-whisper installs into the venv via pip (live progress shown below).',
            'First transcription downloads the <code>small</code> model (~461 MB).',
          ],
        };
      case 'darwin':
        return {
          title: 'Install via a project-local Python venv',
          steps: [
            'Uses your existing Python 3 (install via Homebrew if missing).',
            "We'll create <code>.venv-whisper/</code> in the app directory.",
            'openai-whisper installs into the venv — no <code>sudo</code> required.',
            'First transcription downloads the <code>small</code> model (~461 MB).',
          ],
        };
      default:
        return {
          title: 'Install via a project-local Python venv',
          steps: [
            'Uses your system Python 3.',
            "We'll create <code>.venv-whisper/</code> in the app directory.",
            'This avoids the "externally-managed-environment" pip error on Ubuntu 23.04+, Debian 12+, Fedora 38+.',
            'First transcription downloads the <code>small</code> model (~461 MB).',
          ],
        };
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // Internals
  // ─────────────────────────────────────────────────────────────────

  /**
   * List of [cmd, ...args] candidates to probe. Always uses array form
   * so paths with spaces survive intact.
   */
  _candidateCommands() {
    const vp = this.venvPaths;
    const out = [
      // Project-local venv — the canonical location we install into.
      [vp.whisper],
      [vp.python, '-m', 'whisper'],
    ];

    if (this.platform === 'win32') {
      out.push(
        ['whisper'],
        ['whisper.exe'],
        // System Python via the launcher `py` (canonical Windows invocation)
        ['py', '-m', 'whisper'],
        ['python', '-m', 'whisper'],
      );
    } else if (this.platform === 'darwin') {
      out.push(
        ['/opt/homebrew/bin/whisper'],
        ['/usr/local/bin/whisper'],
        ['whisper'],
        ['python3', '-m', 'whisper'],
      );
    } else {
      out.push(
        ['whisper'],
        ['/usr/local/bin/whisper'],
        ['/usr/bin/whisper'],
        ['python3', '-m', 'whisper'],
      );
    }
    return out;
  }

  /**
   * Parse a user-supplied command string (e.g. from WHISPER_COMMAND env)
   * into a `[cmd, ...args]` tuple. Respects double-quoted segments so
   * paths-with-spaces survive intact.
   */
  _parseCommandString(cmdString) {
    if (!cmdString) return null;
    const trimmed = String(cmdString).trim();
    if (!trimmed) return null;
    const parts = trimmed.match(/(?:[^\s"]+|"[^"]*")+/g) || [trimmed];
    return parts.map((p) => p.replace(/^"|"$/g, ''));
  }

  async _probe(candidate) {
    const cmd = candidate[0];
    const args = [...candidate.slice(1), '--help'];
    const r = await this.runExec(cmd, args);
    if (!r.ok) return { ok: false };
    const version = this._extractVersion(r.stdout + r.stderr);
    return { ok: true, version };
  }

  _extractVersion(text) {
    const m = text && text.match(/whisper\s+v?(\d+\.\d+\.\d+)/i);
    return m ? m[1] : null;
  }

  /**
   * Find a Python interpreter. Returns the resolved command name (which
   * may be a full path) or null if nothing usable is on PATH.
   */
  _detectPython() {
    const candidates = this.platform === 'win32'
      ? ['py', 'python', 'python3']
      : ['python3', 'python'];
    for (const c of candidates) {
      try {
        const which = require('child_process').spawnSync(
          this.platform === 'win32' ? 'where' : 'which',
          [c],
          { windowsHide: true, encoding: 'utf8' },
        );
        if (which.status === 0) {
          const lines = (which.stdout || '')
            .toString()
            .split(/\r?\n/)
            .map((l) => l.trim())
            .filter(Boolean)
            // Skip the Microsoft Store python stub (…\WindowsApps\python.exe):
            // it's a launcher that opens the Store and fails `-m venv` with a
            // cryptic error, so prefer any real interpreter instead.
            .filter((l) => !/WindowsApps/i.test(l));
          if (lines.length > 0) {
            return lines[0];
          }
          // `py` is a valid launcher even when `where` prints no usable path.
          if (c === 'py') return c;
        }
      } catch (_) { /* ignore */ }
    }
    return null;
  }

  /**
   * Resolve Python's `--version` string into a `major.minor` tuple
   * (e.g. '3.11'). Returns null if it can't be determined.
   */
  async _getPythonVersion(pythonCmd) {
    const r = await this.runExec(pythonCmd, ['-c', 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")'], {
      timeout: 10000,
    });
    if (!r.ok) return null;
    const m = (r.stdout || '').trim().match(/^(\d+)\.(\d+)/);
    return m ? `${m[1]}.${m[2]}` : null;
  }

  /**
   * openai-whisper requires Python 3.9+. We warn below 3.10 and refuse
   * below 3.9. Returns false if the version is too old.
   */
  _isPythonVersionOk(version) {
    const m = (version || '').match(/^(\d+)\.(\d+)/);
    if (!m) return false;
    const major = parseInt(m[1], 10);
    const minor = parseInt(m[2], 10);
    if (major > 3) return true;
    if (major === 3 && minor >= 9) return true;
    return false;
  }

  async downloadModel(modelName = 'turbo', { onProgress } = {}) {
    if (this.engine === 'whisper-cpp') return this._downloadWhisperCppModel(modelName, { onProgress });
    const sanitized = this._sanitizeModelName(modelName);
    if (!sanitized) return { ok: false, message: 'Invalid model name: ' + modelName, path: null };
    const log = (line) => {
      if (typeof onProgress === 'function' && line) {
        try { onProgress(line); } catch (_) { /* ignore */ }
      }
    };

    let pythonCmd = this._resolveWhisperPython();
    if (!pythonCmd) {
      const detectResult = await this.detect();
      if (!detectResult.found) {
        return { ok: false, message: 'Whisper CLI not found. Install Whisper first.' };
      }
      pythonCmd = this._pythonFromCommand(detectResult.command);
    }

    const downloadRoot = this.modelDir;
    try { fs.mkdirSync(downloadRoot, { recursive: true }); } catch (_) { /* best effort */ }
    log(`→ Downloading ${modelName} weights to ${downloadRoot} (this may take a minute)…`);
    const loadResult = await this.runExec(pythonCmd, [
      '-c',
      `import whisper; whisper.load_model(${JSON.stringify(sanitized)}, download_root=${JSON.stringify(downloadRoot)}); print('model_loaded')`
    ], {
      timeout: 600000,
      onProgress: log,
    });

    if (!loadResult.ok) {
      return { ok: false, message: loadResult.stderr || loadResult.error };
    }

    const modelPath = this._getModelPath(sanitized);
    log(`✓ Model ${sanitized} ready at ${modelPath}`);
    return { ok: true, message: `Model ${sanitized} downloaded successfully`, path: modelPath };
  }

  _resolveWhisperPython() {
    const vp = this.venvPaths;
    if (fs.existsSync(vp.python)) return vp.python;

    const configured = (process.env.WHISPER_COMMAND || '').trim();
    if (configured) return this._pythonFromCommand(configured);
    return null;
  }

  _pythonFromCommand(command) {
    if (!command) return this.platform === 'win32' ? 'python' : 'python3';
    const tokens = (String(command).match(/(?:[^\s"]+|"[^"]*")+/g) || [])
      .map((p) => p.replace(/^"|"$/g, ''))
      .filter(Boolean);
    if (!tokens.length) return this.platform === 'win32' ? 'python' : 'python3';

    if (tokens.indexOf('-m') > 0) return tokens[0];

    const binDir = path.dirname(tokens[0]);
    const sibling = path.join(binDir, this.platform === 'win32' ? 'python.exe' : 'python');
    if (fs.existsSync(sibling)) return sibling;
    return this.platform === 'win32' ? 'python' : 'python3';
  }

  /**
   * Get the expected model cache path inside our unified model dir.
   */
  _getModelPath(modelName) {
    const modelDirAbs = path.resolve(this.modelDir);
    const name = this._sanitizeModelName(modelName);
    if (!name || name.includes('..')) throw new Error('Invalid model name: ' + modelName);
    if (this.engine === 'whisper-cpp') {
      const resolved = path.resolve(this.modelDir, 'ggml-' + this._normaliseWhisperCppModelName(name) + '.bin');
      if (!resolved.startsWith(modelDirAbs + path.sep)) throw new Error('Invalid model path: ' + modelName);
      return resolved;
    }
    const resolved = path.resolve(this.modelDir, name + '.pt');
    if (!resolved.startsWith(modelDirAbs + path.sep)) throw new Error('Invalid model path: ' + modelName);
    return resolved;
  }
}

module.exports = WhisperInstaller;
module.exports.WhisperInstaller = WhisperInstaller;
module.exports.runExec = runExec;
module.exports.buildChildEnv = buildChildEnv;
