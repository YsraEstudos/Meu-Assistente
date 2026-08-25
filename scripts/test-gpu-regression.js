'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const RX6600_PATTERN = /AMD\s+Radeon\s+RX\s+6600/i;

function parseTarget() {
  const targetIndex = process.argv.indexOf('--target');
  return targetIndex >= 0 ? process.argv[targetIndex + 1] || 'source' : 'source';
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    windowsHide: true,
    ...options
  });
  assert(!result.error, `Falha ao executar ${command}: ${result.error?.message || 'erro desconhecido'}`);
  return result;
}

function findPython() {
  const candidates = process.platform === 'win32'
    ? [
      { command: process.env.PYTHON || 'python', args: [] },
      { command: 'py', args: ['-3'] }
    ]
    : [
      { command: process.env.PYTHON || 'python3', args: [] },
      { command: 'python', args: [] }
    ];

  for (const candidate of candidates) {
    const result = spawnSync(candidate.command, [...candidate.args, '-c', 'import sys; print(sys.executable)'], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 10000
    });
    if (!result.error && result.status === 0) return candidate;
  }
  assert.fail('Python 3 não encontrado para executar os testes do worker');
}

function parseVulkanDevices(output) {
  const blocks = String(output || '').split(/(?=^\s*GPU\d+:)/m);
  return blocks.flatMap((block) => {
    const indexMatch = block.match(/^\s*GPU(\d+):/m);
    if (!indexMatch) return [];
    const nameMatch = block.match(/^\s*deviceName\s*=\s*(.+)$/im);
    const typeMatch = block.match(/^\s*deviceType\s*=\s*(.+)$/im);
    return [{
      index: indexMatch[1],
      name: nameMatch ? nameMatch[1].trim() : '',
      type: typeMatch ? typeMatch[1].trim() : ''
    }];
  });
}

function readPackagedFile(resourcesDir, relativePath) {
  const asarPath = path.join(resourcesDir, 'app.asar');
  assert(fs.existsSync(asarPath), 'app.asar não encontrado: ' + asarPath);
  const asar = require('@electron/asar');
  const expected = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
  const archivePath = asar.listPackage(asarPath)
    .map((entry) => entry.replace(/^[/\\]+/, ''))
    .find((entry) => entry.replace(/\\/g, '/').replace(/^\/+/, '') === expected);
  assert(archivePath, 'Arquivo não encontrado no app.asar: ' + relativePath);
  return asar.extractFile(asarPath, archivePath).toString('utf8');
}
function resolveTarget(target) {
  if (target === 'source') {
    return {
      label: 'source',
      worker: path.join(projectRoot, 'scripts', 'whisper-cpp-worker.py'),
      resources: null
    };
  }
  if (target === 'build') {
    const resources = path.join(projectRoot, 'dist', 'win-unpacked', 'resources');
    return {
      label: 'build/win-unpacked',
      worker: path.join(resources, 'app.asar.unpacked', 'scripts', 'whisper-cpp-worker.py'),
      resources
    };
  }
  if (target === 'installed') {
    const resources = path.join(process.env.LOCALAPPDATA || '', 'Programs', 'OpenCluely', 'resources');
    return {
      label: 'installed',
      worker: path.join(resources, 'app.asar.unpacked', 'scripts', 'whisper-cpp-worker.py'),
      resources
    };
  }
  assert.fail(`Target inválido: ${target}. Use source, build ou installed.`);
}

function resolveWhisperAssets() {
  const roaming = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  const binary = process.env.WHISPER_CPP_BINARY || path.join(
    roaming,
    'opencluely',
    '.whisper.cpp',
    'build',
    'bin',
    'Release',
    process.platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli'
  );
  const model = process.env.WHISPER_CPP_MODEL || path.join(
    roaming,
    'opencluely',
    '.whisper-cpp-models',
    'ggml-large-v3-turbo.bin'
  );
  assert(fs.existsSync(binary), `whisper-cli não encontrado: ${binary}`);
  assert(fs.existsSync(model), `modelo whisper.cpp não encontrado: ${model}`);
  return { binary, model };
}

function createProbeWav() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'opencluely-gpu-regression-'));
  const filePath = path.join(directory, 'probe.wav');
  const sampleRate = 16000;
  const sampleCount = sampleRate * 2;
  const dataSize = sampleCount * 2;
  const wav = Buffer.alloc(44 + dataSize);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(36 + dataSize, 4);
  wav.write('WAVE', 8);
  wav.write('fmt ', 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(dataSize, 40);
  fs.writeFileSync(filePath, wav);
  return { directory, filePath };
}

function parseNdjson(stdout) {
  return String(stdout || '').split(/\r?\n/).filter(Boolean).map((line) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      assert.fail(`Worker retornou NDJSON inválido: ${line}\n${error.message}`);
    }
  });
}

function runWorker(worker, assets, python, audioPath, selectedDevice) {
  const input = [
    JSON.stringify({ type: 'transcribe', id: 'gpu-regression', audioPath }),
    JSON.stringify({ type: 'stop' })
  ].join('\n') + '\n';
  const result = run(python.command, [...python.args, worker, '--binary', assets.binary, '--model', assets.model, '--language', 'pt', '--threads', '2', '--backend', 'vulkan', '--device', 'auto'], {
    input,
    timeout: 180000,
    env: {
      ...process.env,
      // The worker must remain Unicode-safe even when Windows starts Python with a legacy code page.
      PYTHONIOENCODING: 'cp1252',
      PYTHONUTF8: '0'
    }
  });
  assert.equal(result.status, 0, result.stderr || 'worker encerrou com erro');
  const messages = parseNdjson(result.stdout);
  const ready = messages.find((message) => message.type === 'ready');
  const transcript = messages.find((message) => message.id === 'gpu-regression');
  assert(ready, 'worker não enviou a mensagem ready');
  assert(transcript, 'worker não enviou o resultado da transcrição');
  assert.equal(transcript.ok, true, `transcrição GPU falhou: ${transcript.error || 'erro desconhecido'}`);
  assert.equal(transcript.backend, 'vulkan', `fallback inesperado: backend=${transcript.backend}`);
  assert.notEqual(transcript.backend, 'cpu', 'fallback inesperado para CPU');
  assert.equal(String(transcript.device), String(selectedDevice.index), 'worker escolheu um dispositivo Vulkan diferente do adaptador discreto');
  assert(RX6600_PATTERN.test(transcript.gpuName), `worker não confirmou a RX 6600: ${transcript.gpuName}`);
  assert(!String(transcript.text || '').includes('\ufffd'), 'worker corrompeu caracteres UTF-8 na transcrição');
  assert(!transcript.error, `worker retornou erro após a transcrição: ${transcript.error}`);
  return transcript;
}

function runRuntimeDiagnostic(assets, devices) {
  const speechService = require(path.join(projectRoot, 'src', 'services', 'speech.service'));
  const selectedDevice = devices.find((device) => device.type.toUpperCase().includes('PHYSICAL_DEVICE_TYPE_DISCRETE_GPU'));
  const launch = { binary: assets.binary, model: assets.model, backend: 'vulkan' };
  const originals = {
    provider: speechService.provider,
    available: speechService.available,
    effectiveWhisperEngine: speechService.effectiveWhisperEngine,
    whisperCppLaunch: speechService.whisperCppLaunch,
    getConfigured: speechService._getConfiguredWhisperEngine,
    getEffective: speechService._getEffectiveWhisperEngine,
    resolveLaunch: speechService._resolveWhisperCppLaunch,
    scriptProbe: speechService._runHardwareScriptJson
  };
  speechService.provider = 'whisper';
  speechService.available = true;
  speechService.effectiveWhisperEngine = 'whisper-cpp';
  speechService.whisperCppLaunch = launch;
  speechService._getConfiguredWhisperEngine = () => 'whisper-cpp';
  speechService._getEffectiveWhisperEngine = () => 'whisper-cpp';
  speechService._resolveWhisperCppLaunch = () => launch;
  speechService._runHardwareScriptJson = (filename) => filename === 'detect-gpu.py'
    ? { device: 'cpu', cuda: false, rocm: false, gpuName: selectedDevice.name, vulkan: true, vulkanGpuName: selectedDevice.name }
    : { vendor: 'AMD', cpuName: 'test CPU', has_avx2: true, has_avx512: false, blas_available: true, logical_cpus: 1 };
  try {
    const status = speechService.getHardwareStatus({ probe: true });
    assert.equal(status.probe?.success, true, `diagnóstico do backend falhou: ${status.probe?.message || 'sem resultado'}`);
    assert.equal(status.execution.kind, 'gpu');
    assert.equal(status.execution.backend, 'vulkan');
    assert(RX6600_PATTERN.test(status.execution.gpuName), `diagnóstico não mostrou a GPU em uso: ${status.execution.gpuName}`);
    assert.equal(String(status.probe.device), String(selectedDevice.index));
    assert(RX6600_PATTERN.test(status.probe.gpuName));
    return status;
  } finally {
    speechService.provider = originals.provider;
    speechService.available = originals.available;
    speechService.effectiveWhisperEngine = originals.effectiveWhisperEngine;
    speechService.whisperCppLaunch = originals.whisperCppLaunch;
    speechService._getConfiguredWhisperEngine = originals.getConfigured;
    speechService._getEffectiveWhisperEngine = originals.getEffective;
    speechService._resolveWhisperCppLaunch = originals.resolveLaunch;
    speechService._runHardwareScriptJson = originals.scriptProbe;
  }
}

function assertInterfaceContract(target) {
  const files = target.resources
    ? {
      index: readPackagedFile(target.resources, 'index.html'),
      main: readPackagedFile(target.resources, 'main.js'),
      preload: readPackagedFile(target.resources, 'preload.js'),
      mainWindow: readPackagedFile(target.resources, 'src/ui/main-window.js'),
      speech: readPackagedFile(target.resources, 'src/services/speech.service.js')
    }
    : {
      index: fs.readFileSync(path.join(projectRoot, 'index.html'), 'utf8'),
      main: fs.readFileSync(path.join(projectRoot, 'main.js'), 'utf8'),
      preload: fs.readFileSync(path.join(projectRoot, 'preload.js'), 'utf8'),
      mainWindow: fs.readFileSync(path.join(projectRoot, 'src', 'ui', 'main-window.js'), 'utf8'),
      speech: fs.readFileSync(path.join(projectRoot, 'src', 'services', 'speech.service.js'), 'utf8')
    };
  assert(files.index.includes('id="whisperStatusButton"'), 'botão de status da GPU ausente');
  assert(files.index.includes('id="whisperStatusTestButton"'), 'botão de diagnóstico ausente');
  assert(files.main.includes('ipcMain.handle("diagnose-speech"'), 'IPC de diagnóstico ausente');
  assert(files.preload.includes("ipcRenderer.invoke('diagnose-speech'"), 'preload de diagnóstico ausente');
  assert(files.mainWindow.includes("['GPU em uso'"), 'interface não exibe a GPU em uso');
  assert(files.mainWindow.includes('execution.gpuName'), 'interface não usa o nome da GPU em runtime');
  assert(files.speech.includes('_selectWhisperCppVulkanDevice'), 'seletor de GPU não está no pacote final');
  assert(files.speech.includes("PYTHONIOENCODING: 'utf-8'"), 'worker do pacote final não força UTF-8');
}

function main() {
  const target = resolveTarget(parseTarget());
  assert(fs.existsSync(target.worker), `worker não encontrado no alvo ${target.label}: ${target.worker}`);
  const vulkan = run('vulkaninfo', ['--summary'], { timeout: 15000 });
  assert.equal(vulkan.status, 0, vulkan.stderr || 'vulkaninfo falhou');
  const devices = parseVulkanDevices(`${vulkan.stdout}\n${vulkan.stderr}`);
  assert(devices.length >= 2, `menos de dois dispositivos Vulkan detectados: ${JSON.stringify(devices)}`);
  const rx6600 = devices.find((device) => RX6600_PATTERN.test(device.name));
  assert(rx6600, `AMD Radeon RX 6600 não detectada: ${devices.map((device) => device.name).join(' | ')}`);
  assert(/PHYSICAL_DEVICE_TYPE_DISCRETE_GPU/i.test(rx6600.type), `RX 6600 não é discreta no Vulkan: ${rx6600.type}`);
  const integrated = devices.find((device) => /PHYSICAL_DEVICE_TYPE_INTEGRATED_GPU/i.test(device.type));
  assert(integrated, 'GPU integrada não apareceu no inventário Vulkan; seleção entre integrada e discreta não foi testada');
  const selected = devices.find((device) => /PHYSICAL_DEVICE_TYPE_DISCRETE_GPU/i.test(device.type));
  assert(selected && RX6600_PATTERN.test(selected.name), `seletor discreto não aponta para a RX 6600: ${JSON.stringify(selected)}`);

  const detectScript = target.resources
    ? path.join(target.resources, 'app.asar.unpacked', 'scripts', 'detect-gpu.py')
    : path.join(projectRoot, 'scripts', 'detect-gpu.py');
  assert(fs.existsSync(detectScript), `detect-gpu.py não encontrado no alvo ${target.label}`);
  const python = findPython();
  const detect = run(python.command, [...python.args, detectScript], {
    timeout: 15000,
    env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' }
  });
  assert.equal(detect.status, 0, detect.stderr || 'detect-gpu.py falhou');
  const detected = JSON.parse(detect.stdout.trim());
  assert.equal(detected.vulkan, true, 'detect-gpu.py não confirmou Vulkan');
  assert(RX6600_PATTERN.test(detected.vulkanGpuName), `detect-gpu.py não confirmou a RX 6600: ${detected.vulkanGpuName}`);

  const assets = resolveWhisperAssets();
  const probe = createProbeWav();
  try {
    const transcript = runWorker(target.worker, assets, python, probe.filePath, selected);
    const status = runRuntimeDiagnostic(assets, devices);
    assertInterfaceContract(target);
    console.log(`GPU regression tests: passed (${target.label})`);
    console.log(JSON.stringify({
      detected: detected.vulkanGpuName,
      selected: selected.name,
      selectedType: selected.type,
      runtimeBackend: transcript.backend,
      runtimeGpu: transcript.gpuName,
      runtimeDevice: transcript.device,
      diagnosticBackend: status.execution.backend,
      diagnosticGpu: status.execution.gpuName
    }, null, 2));
  } finally {
    try { fs.rmSync(probe.directory, { recursive: true, force: true }); } catch (_) { /* best effort */ }
  }
}

try {
  main();
} catch (error) {
  console.error(`GPU regression tests: failed\n${error.stack || error.message}`);
  process.exitCode = 1;
}
